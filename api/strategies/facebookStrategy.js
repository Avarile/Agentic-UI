/**
 * Facebook OAuth2 provider binding.
 *
 * Supplies the profile normalizer only; account logic lives in `strategies/socialLogin.js`.
 * `profileFields` must be requested explicitly — Facebook returns only id by default — and
 * `proxy: true` makes the callback URL correct behind a reverse proxy.
 *
 * Exports the user strategy as the default and the admin (`existingUsersOnly`) variant as
 * `.facebookAdminLogin`.
 */
const FacebookStrategy = require('passport-facebook').Strategy;
const socialLogin = require('./socialLogin');

const getProfileDetails = ({ profile }) => ({
  email: profile.emails[0]?.value,
  id: profile.id,
  avatarUrl: profile.photos[0]?.value,
  username: profile.displayName,
  name: profile.name?.givenName + ' ' + profile.name?.familyName,
  emailVerified: true,
});

const facebookLogin = socialLogin('facebook', getProfileDetails);
const facebookAdminLogin = socialLogin('facebook', getProfileDetails, { existingUsersOnly: true });

const getFacebookConfig = (callbackURL) => ({
  clientID: process.env.FACEBOOK_CLIENT_ID,
  clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
  callbackURL,
  proxy: true,
  scope: ['public_profile'],
  profileFields: ['id', 'email', 'name'],
});

const facebookStrategy = () =>
  new FacebookStrategy(
    getFacebookConfig(`${process.env.DOMAIN_SERVER}${process.env.FACEBOOK_CALLBACK_URL}`),
    facebookLogin,
  );

const facebookAdminStrategy = () =>
  new FacebookStrategy(
    getFacebookConfig(`${process.env.DOMAIN_SERVER}/api/admin/oauth/facebook/callback`),
    facebookAdminLogin,
  );

module.exports = facebookStrategy;
module.exports.facebookAdminLogin = facebookAdminStrategy;
