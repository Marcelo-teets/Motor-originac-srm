// A signed JWT proves identity, but not current institutional authorization.
const emailKey = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : '';

export const hasVerifiedInstitutionalIdentity = (
  profileEmail: unknown,
  providerEmail: unknown,
  emailVerified: unknown,
  banned: unknown,
): boolean => {
  const profile = emailKey(profileEmail);
  const provider = emailKey(providerEmail);
  return profile.length > 0 && provider.length > 0
    && profile === provider && emailVerified === true && banned !== true;
};

export const hasVerifiedTokenIdentity = (
  tokenEmail: unknown,
  profileEmail: unknown,
  providerEmail: unknown,
  emailVerified: unknown,
  banned: unknown,
): boolean => {
  const token = emailKey(tokenEmail);
  return token.length > 0 && token === emailKey(providerEmail)
    && hasVerifiedInstitutionalIdentity(profileEmail, providerEmail, emailVerified, banned);
};
