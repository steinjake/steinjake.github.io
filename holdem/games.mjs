// Add confirmed games here. Use an explicit UTC offset for the Cambridge start time.
// This schedule is separate from completed-game financial results.
export const scheduledGames = [
  {startsAt: '2026-10-09T20:00:00-04:00', location: 'Cambridge'},
];

const timeZone = 'America/New_York';
export function upcomingGames(games = scheduledGames, now = new Date()) {
  return games.filter(game => Number.isFinite(Date.parse(game.startsAt)) && Date.parse(game.startsAt) > now.getTime())
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).slice(0, 3);
}
export function gameLabels(game) {
  const date = new Date(game.startsAt);
  const format = options => new Intl.DateTimeFormat('en-US', {timeZone, ...options}).format(date);
  return {
    date: format({weekday: 'long', month: 'long', day: 'numeric'}),
    fullDate: format({weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'}),
    time: format({hour: 'numeric', minute: '2-digit', hour12: true}).replace(':00', '') + ' Eastern',
    month: format({month: 'short'}),
    day: format({day: '2-digit'}),
  };
}
export function seatRequestUrl(game) {
  const {fullDate, time} = gameLabels(game);
  const subject = `Cambridge Hold ’Em — seat request: ${fullDate}`;
  const body = `Hey Jake,\r\n\r\nI'd like a seat for poker on ${fullDate} at ${time}.\r\n\r\nPlease confirm my spot and add me to the game chat. Thanks!`;
  return `mailto:steinjp@mit.edu?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
