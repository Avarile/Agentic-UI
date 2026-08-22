/**
 * Google OAuth2 provider binding.
 *
 * Only supplies the profile normalizer; all account logic lives in `strategies/socialLogin.js`.
 * `proxy: true` is set so the callback URL is derived correctly behind a reverse proxy.
 *
 * Exports the user strategy as the default and the admin (`existingUsersOnly`) strategy as
 * `.googleAdminLogin`. Google is also the one provider whose `refreshToken` is passed through
 * to the verify result, because Google-backed integrations need it for offline access.
 */
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const socialLogin = require('./socialLogin');

const getProfileDetails = ({ profile }) => ({
  email: profile.emails[0].value,
  id: profile.id,
  avatarUrl: profile.photos[0].value,
  username: profile.name.givenName,
  name: `${profile.name.givenName}${profile.name.familyName ? ` ${profile.name.familyName}` : ''}`,
  emailVerified: profile.emails[0].verified,
});

const googleLogin = socialLogin('google', getProfileDetails);
const googleAdminLogin = socialLogin('google', getProfileDetails, { existingUsersOnly: true });

const getGoogleConfig = (callbackURL) => ({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL,
  proxy: true,
});

const googleStrategy = () =>
  new GoogleStrategy(
    getGoogleConfig(`${process.env.DOMAIN_SERVER}${process.env.GOOGLE_CALLBACK_URL}`),
    googleLogin,
  );

const googleAdminStrategy = () =>
  new GoogleStrategy(
    getGoogleConfig(`${process.env.DOMAIN_SERVER}/api/admin/oauth/google/callback`),
    googleAdminLogin,
  );

module.exports = googleStrategy;
module.exports.googleAdminLogin = googleAdminStrategy;
