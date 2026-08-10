export default function BrandLogo() {
  return (
    <img
      className="brand-logo"
      src={`${import.meta.env.BASE_URL}brand-logo.png`}
      alt=""
      aria-hidden="true"
    />
  );
}
