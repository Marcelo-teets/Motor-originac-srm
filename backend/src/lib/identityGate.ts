import { verifyNeonJwt } from './auth.js';
import { ensureUserProfile, requireGodModeProfile } from './userProfiles.js';

export const verifyActiveIdentity = async (accessToken: string) => {
  try {
    const user = await verifyNeonJwt(accessToken);
    const profile = await ensureUserProfile(user);
    if (profile.status !== 'active') {
      throw Object.assign(new Error('User access is not active.'), { statusCode: 403 });
    }
    return { user, profile };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    throw Object.assign(new Error(error instanceof Error ? error.message : 'Unauthorized.'), { statusCode: 401 });
  }
};

export const verifyGodModeIdentity = async (accessToken: string) => {
  const authenticated = await verifyActiveIdentity(accessToken);
  const profile = await requireGodModeProfile(authenticated.user.id);
  return { ...authenticated, profile };
};
