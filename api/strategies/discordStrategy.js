/**
 * Discord OAuth2 provider binding.
 *
 * Supplies the profile normalizer only; account logic lives in `strategies/socialLogin.js`.
 *
 * Design: Discord does not return a usable avatar URL, so one is constructed — animated
 * avatars are prefixed `a_` and must be requested as `.gif`, and users with no avatar fall
 * back to the numbered default set derived from the discriminator. `prompt=none` is appended
 * to the authorization URL so returning users are not re-prompted for consent.
 *
 * Exports the user strategy as the default and the admin (`existingUsersOnly`) variant as
 * `.discordAdminLogin`.
 */
const { Strategy: DiscordStrategy } = require('passport-discord');
const socialLogin = require('./socialLogin');

const getProfileDetails = ({ profile }) => {
  let avatarUrl;
  if (profile.avatar) {
    const format = profile.avatar.startsWith('a_') ? 'gif' : 'png';
    avatarUrl = `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${format}`;
  } else {
    const defaultAvatarNum = Number(profile.discriminator) % 5;
    avatarUrl = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarNum}.png`;
  }

  return {
    email: profile.email,
    id: profile.id,
    avatarUrl,
    username: profile.username,
    name: profile.global_name,
    emailVerified: true,
  };
};

const discordLogin = socialLogin('discord', getProfileDetails);
const discordAdminLogin = socialLogin('discord', getProfileDetails, { existingUsersOnly: true });

const getDiscordConfig = (callbackURL) => ({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL,
  scope: ['identify', 'email'],
  authorizationURL: 'https://discord.com/api/oauth2/authorize?prompt=none',
});

const discordStrategy = () =>
  new DiscordStrategy(
    getDiscordConfig(`${process.env.DOMAIN_SERVER}${process.env.DISCORD_CALLBACK_URL}`),
    discordLogin,
  );

const discordAdminStrategy = () =>
  new DiscordStrategy(
    getDiscordConfig(`${process.env.DOMAIN_SERVER}/api/admin/oauth/discord/callback`),
    discordAdminLogin,
  );

module.exports = discordStrategy;
module.exports.discordAdminLogin = discordAdminStrategy;
