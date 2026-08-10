import {
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LogIn,
  LogOut,
  Mail,
  ShieldCheck,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import { formatAuthError } from "../auth/auth-request";

type AccountMode = "login" | "register" | "forgot" | "password";
type Notice = { title: string; detail: string; canResendConfirmation?: boolean } | null;

export default function AccountControl() {
  const auth = useAuth();
  const [open, setOpen] = useState(() => Boolean(auth.authError && !auth.user));
  const [mode, setMode] = useState<AccountMode>("login");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !auth.passwordRecovery) closeDialog();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [auth.passwordRecovery, open]);

  useEffect(() => {
    if (auth.authError && !auth.user) setOpen(true);
  }, [auth.authError, auth.user]);

  useEffect(() => {
    if (!auth.signInRequest || auth.user) return;
    setOpen(true);
    setMode("login");
    setNotice(null);
    setError("");
  }, [auth.signInRequest, auth.user]);

  useEffect(() => {
    if (!auth.passwordRecovery) return;
    setOpen(true);
    setMode("password");
    setNotice(null);
    setError("");
  }, [auth.passwordRecovery]);

  const closeDialog = () => {
    if (auth.passwordRecovery) return;
    setOpen(false);
    auth.dismissSignInRequest();
  };

  const resetFormState = (nextMode: AccountMode) => {
    setMode(nextMode);
    setPassword("");
    setPasswordAgain("");
    setShowPassword(false);
    setNotice(null);
    setError("");
    auth.clearAuthError();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (mode !== "password" && !email.trim()) return;
    if ((mode === "login" || mode === "register" || mode === "password") && password.length < 8) {
      setError("密码至少需要 8 位字符。");
      return;
    }
    if ((mode === "register" || mode === "password") && password !== passwordAgain) {
      setError("两次输入的密码不一致。");
      return;
    }
    if (mode === "register" && (displayName.trim().length < 2 || displayName.trim().length > 30)) {
      setError("用户名需要为 2 至 30 个字符。");
      return;
    }

    setSending(true);
    setError("");
    try {
      if (mode === "login") {
        await auth.signInWithPassword(email, password);
        setOpen(false);
        return;
      }
      if (mode === "register") {
        const result = await auth.signUp(displayName, email, password);
        if (result.requiresEmailConfirmation) {
          setNotice({
            title: "请验证邮箱",
            detail: "验证邮件通常会在几分钟内到达，也请检查垃圾邮件。没有收到时可在此重新发送。",
            canResendConfirmation: true,
          });
        } else {
          setOpen(false);
        }
        return;
      }
      if (mode === "forgot") {
        await auth.sendPasswordReset(email);
        setNotice({ title: "重置邮件已经发送", detail: "打开邮件中的链接后，可在本站设置新密码。" });
        return;
      }
      await auth.updatePassword(password);
      setNotice({ title: "密码已经更新", detail: "之后可以直接使用邮箱和新密码登录。" });
      setPassword("");
      setPasswordAgain("");
    } catch (reason) {
      setError(formatAuthError(reason));
    } finally {
      setSending(false);
    }
  };

  const accountName = auth.profile?.displayName || auth.user?.email?.split("@")[0] || "账号";
  const modalTitle = mode === "register"
    ? "注册账号"
    : mode === "forgot"
      ? "找回密码"
      : mode === "password"
        ? "设置新密码"
        : "登录账号";

  return (
    <>
      <button
        className="header-link account-button"
        type="button"
        title={auth.user ? `账号：${accountName}` : "登录账号"}
        aria-label={auth.user ? `打开账号菜单，当前用户${accountName}` : "登录账号"}
        onClick={() => {
          setOpen(true);
          auth.clearAuthError();
          setError("");
          setNotice(null);
          if (!auth.user) setMode("login");
        }}
      >
        {auth.loading ? <LoaderCircle className="spin" size={14} /> : auth.user ? <UserRound size={14} /> : <LogIn size={14} />}
        <span>{auth.loading ? "账号" : auth.user ? accountName : "登录"}</span>
        {auth.isAdmin ? <i>管理员</i> : null}
      </button>

      {open ? (
        <div className="modal-layer" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}>
          <section className="feature-dialog account-dialog" role="dialog" aria-modal="true" aria-label="用户账号">
            <header>
              <div><UserRound size={19} /><span><small>个人账号</small><strong>{auth.user && mode !== "password" ? accountName : modalTitle}</strong></span></div>
              {!auth.passwordRecovery ? <button type="button" onClick={closeDialog} aria-label="关闭账号窗口"><X size={19} /></button> : null}
            </header>

            {auth.user && mode !== "password" ? (
              <div className="account-signed-in">
                <span className="account-avatar"><UserRound size={25} /></span>
                <div>
                  <strong>{accountName}</strong>
                  <span>{auth.user.email}</span>
                  <small>{auth.isAdmin ? <><ShieldCheck size={13} />管理员账号</> : "普通用户"}</small>
                </div>
                {auth.profileError ? <p>{auth.profileError}</p> : null}
                <div className="account-session-actions">
                  <button type="button" onClick={() => resetFormState("password")}><KeyRound size={15} />修改密码</button>
                  <button type="button" onClick={async () => {
                    setError("");
                    try {
                      await auth.signOut();
                      setOpen(false);
                    } catch (reason) {
                      setError(formatAuthError(reason));
                    }
                  }}><LogOut size={15} />退出登录</button>
                </div>
              </div>
            ) : !auth.configured ? (
              <div className="account-message warning"><strong>账号服务尚未配置</strong><span>个人功能暂时不可使用。</span></div>
            ) : notice ? (
              <div className="account-message success">
                <Mail size={24} /><strong>{notice.title}</strong><span>{notice.detail}</span>
                {notice.canResendConfirmation ? (
                  <button type="button" disabled={sending} onClick={async () => {
                    setSending(true);
                    setError("");
                    try {
                      await auth.resendSignUpConfirmation(email);
                      setNotice({
                        title: "验证邮件已重新发送",
                        detail: "请稍候检查收件箱和垃圾邮件。为防止重复发送，短时间内请不要连续点击。",
                        canResendConfirmation: true,
                      });
                    } catch (reason) {
                      setError(formatAuthError(reason));
                    } finally {
                      setSending(false);
                    }
                  }}>{sending ? <LoaderCircle className="spin" size={15} /> : <Mail size={15} />}{sending ? "正在发送" : "重新发送验证邮件"}</button>
                ) : null}
                <button type="button" onClick={() => resetFormState("login")}>返回登录</button>
              </div>
            ) : (
              <form className="account-login-form" onSubmit={submit}>
                {mode === "login" || mode === "register" ? (
                  <div className="account-mode-tabs" role="tablist" aria-label="账号操作">
                    <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => resetFormState("login")}>登录</button>
                    <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => resetFormState("register")}>注册</button>
                  </div>
                ) : null}
                {auth.signInRequest?.reason && mode === "login" ? <p className="account-login-reason"><KeyRound size={14} />{auth.signInRequest.reason}</p> : null}
                {mode === "register" ? (
                  <label><span>用户名</span><input type="text" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="username" maxLength={30} placeholder="用于网站内显示" required /></label>
                ) : null}
                {mode !== "password" ? (
                  <label><span>邮箱地址</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@example.com" required /></label>
                ) : null}
                {mode !== "forgot" ? (
                  <label>
                    <span>{mode === "password" ? "新密码" : "密码"}</span>
                    <span className="password-input"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "隐藏密码" : "显示密码"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
                  </label>
                ) : null}
                {mode === "register" || mode === "password" ? (
                  <label><span>再次输入密码</span><input type={showPassword ? "text" : "password"} value={passwordAgain} onChange={(event) => setPasswordAgain(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
                ) : null}
                <button type="submit" disabled={sending}>
                  {sending ? <LoaderCircle className="spin" size={16} /> : mode === "register" ? <UserPlus size={16} /> : mode === "forgot" ? <Mail size={16} /> : <KeyRound size={16} />}
                  {sending ? "正在处理" : mode === "register" ? "注册账号" : mode === "forgot" ? "发送重置邮件" : mode === "password" ? "保存新密码" : "登录"}
                </button>
                <div className="account-form-links">
                  {mode === "login" ? <button type="button" onClick={() => resetFormState("forgot")}>忘记密码</button> : null}
                  {mode === "forgot" || (mode === "password" && !auth.passwordRecovery) ? <button type="button" onClick={() => resetFormState("login")}>返回登录</button> : null}
                </div>
              </form>
            )}
            {error || (!auth.user && auth.authError) ? <p className="account-error" role="alert">{error || auth.authError}</p> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
