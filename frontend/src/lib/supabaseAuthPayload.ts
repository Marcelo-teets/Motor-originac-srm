export type GoTrueCaptchaSecurity = {
  gotrue_meta_security: {
    captcha_token: string;
  };
};

export const buildCaptchaSecurityPayload = (
  captchaToken?: string,
): GoTrueCaptchaSecurity | Record<string, never> => {
  const normalizedToken = captchaToken?.trim();
  if (!normalizedToken) return {};

  return {
    gotrue_meta_security: {
      captcha_token: normalizedToken,
    },
  };
};

export const buildPasswordGrantPayload = (
  email: string,
  password: string,
  captchaToken?: string,
) => ({
  email,
  password,
  ...buildCaptchaSecurityPayload(captchaToken),
});

export const buildPasswordRecoveryPayload = (
  email: string,
  captchaToken?: string,
) => ({
  email,
  ...buildCaptchaSecurityPayload(captchaToken),
});
