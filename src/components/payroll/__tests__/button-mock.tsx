export const Button = ({
  children,
  isDisabled,
  ...rest
}: {
  children: React.ReactNode
  isDisabled?: boolean
  [key: string]: unknown
}) => (
  <button {...(rest as Record<string, unknown>)} disabled={isDisabled}>
    {children}
  </button>
)

export const buttonVariants = () => ""
