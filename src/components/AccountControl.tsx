import { LoaderCircle, LogIn, LogOut, Mail, ShieldCheck, UserRound, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";

export default function AccountControl() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setError("");
    try {
      await auth.signInWithEmail(email);
      setSent(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSending(false);
    }
  };

  const displayName = auth.profile?.displayName || auth.user?.email?.split("@")[0] || "账号";

  return (
    <>
      <button
        className="header-link account-button"
        type="button"
        title={auth.user ? `账号：${displayName}` : "登录账号"}
        aria-label={auth.user ? `打开账号菜单，当前用户${displayName}` : "登录账号"}
        onClick={() => {
          setOpen(true);
          setError("");
          setSent(false);
        }}
      >
        {auth.loading ? <LoaderCircle className="spin" size={14} /> : auth.user ? <UserRound size={14} /> : <LogIn size={14} />}
        <span>{auth.loading ? "账号" : auth.user ? displayName : "登录"}</span>
        {auth.isAdmin ? <i>管理员</i> : null}
      </button>

      {open ? (
        <div className="modal-layer" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="feature-dialog account-dialog" role="dialog" aria-modal="true" aria-label="用户账号">
            <header>
              <div><UserRound size={19} /><span><small>个人账号</small><strong>{auth.user ? displayName : "登录账号"}</strong></span></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="关闭账号窗口"><X size={19} /></button>
            </header>

            {auth.user ? (
              <div className="account-signed-in">
                <span className="account-avatar"><UserRound size={25} /></span>
                <div>
                  <strong>{displayName}</strong>
                  <span>{auth.user.email}</span>
                  <small>{auth.isAdmin ? <><ShieldCheck size={13} />管理员账号</> : "普通用户"}</small>
                </div>
                {auth.profileError ? <p>{auth.profileError}</p> : null}
                <button type="button" onClick={async () => {
                  setError("");
                  try {
                    await auth.signOut();
                    setOpen(false);
                  } catch (reason) {
                    setError(reason instanceof Error ? reason.message : String(reason));
                  }
                }}><LogOut size={15} />退出登录</button>
              </div>
            ) : !auth.configured ? (
              <div className="account-message warning"><strong>账号服务尚未配置</strong><span>当前仍可使用本机关注和观演标记。</span></div>
            ) : sent ? (
              <div className="account-message success"><Mail size={24} /><strong>登录邮件已经发送</strong><span>请在当前设备打开邮件中的登录链接。</span><button type="button" onClick={() => setSent(false)}>更换邮箱</button></div>
            ) : (
              <form className="account-login-form" onSubmit={submit}>
                <p>使用邮箱登录后，账号会在本设备保持登录状态。</p>
                <label><span>邮箱地址</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@example.com" required /></label>
                <button type="submit" disabled={sending}>{sending ? <LoaderCircle className="spin" size={16} /> : <Mail size={16} />}{sending ? "正在发送" : "发送登录邮件"}</button>
              </form>
            )}
            {error ? <p className="account-error" role="alert">{error}</p> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
