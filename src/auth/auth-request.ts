export const authNetworkErrorMessage = "暂时无法连接账号服务，请检查网络后重试。若多次出现，当前网络可能无法访问账号服务。";

export function isAuthNetworkError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason ?? "");
  const name = typeof reason === "object" && reason && "name" in reason ? String(reason.name) : "";
  return /failed to fetch|fetch failed|network request failed|networkerror|load failed|authretryablefetcherror/i.test(
    `${name} ${message}`,
  );
}

export async function withAuthNetworkRetry<T extends { error: unknown }>(
  request: () => PromiseLike<T>,
  retryDelays = [800, 1_600],
) {
  let networkError: unknown;
  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      const result = await request();
      if (!isAuthNetworkError(result.error)) return result;
      networkError = result.error;
    } catch (reason) {
      if (!isAuthNetworkError(reason)) throw reason;
      networkError = reason;
    }

    if (attempt < retryDelays.length) {
      await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
    }
  }

  throw new Error(authNetworkErrorMessage, { cause: networkError });
}

export function formatAuthError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason);
  const code = typeof reason === "object" && reason && "code" in reason ? String(reason.code) : "";
  const detail = `${code} ${message}`;
  if (isAuthNetworkError(reason)) return authNetworkErrorMessage;
  if (/invalid login credentials/i.test(detail)) return "邮箱或密码不正确。";
  if (/email not confirmed/i.test(detail)) return "邮箱尚未验证，请先打开注册邮件中的链接。";
  if (/user already registered/i.test(detail)) return "该邮箱已经注册，请直接登录或找回密码。";
  if (/password should be at least/i.test(detail)) return "密码长度不足，请至少输入 8 位字符。";
  if (/email_address_not_authorized|email address not authorized/i.test(detail)) {
    return "当前邮件服务尚未完成外部发信配置，暂时无法向该邮箱发送验证邮件。请联系网站管理员。";
  }
  if (/over_email_send_rate_limit|email rate limit|rate limit/i.test(detail)) return "邮件发送过于频繁，请稍后再试。";
  return message;
}
