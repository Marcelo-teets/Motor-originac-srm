export default function Button({
  children,
  variant = 'primary',
  type = 'button',
  className = '',
  fullWidth = false,
  ...props
}) {
  return (
    <button
      type={type}
      className={`button button--${variant} ${fullWidth ? 'button--full' : ''} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
