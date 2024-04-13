export function formatTelegramUserName(user: { first_name: string; username?: string }): string {
  return user.username ? `${user.first_name} (@${user.username})` : user.first_name
}