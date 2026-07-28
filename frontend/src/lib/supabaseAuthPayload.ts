export const buildPasswordGrantPayload = (
  email: string,
  password: string,
) => ({
  email,
  password,
});

export const buildPasswordRecoveryPayload = (
  email: string,
) => ({
  email,
});
