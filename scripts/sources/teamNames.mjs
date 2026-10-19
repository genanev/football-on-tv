// Full club names for display (George, 19 Oct 2026: "Wolverhampton Wanderers", not API-Football's
// "Wolves"). Only what's shown changes: matching against TV listings still works from API-Football's
// name, fuzzily (teamSim + ALIASES in football.mjs).
//
// Every club in the four English leagues, API-Football's name -> the name premierleague.com and
// efl.com use. Made on 19 Oct 2026 from API-Football's /teams lists and the official feeds' names,
// paired by teamSim and checked by hand ("Sheffield Utd" was a tie between the two Sheffield clubs;
// "Milton Keynes Dons" kept over the EFL's "MK Dons"). A club not listed here (promoted from the
// National League, or renamed by API-Football) keeps API-Football's name, and the update's report
// lists it under apiFootball.unknownClubs so it can be added. Check after each summer's promotions.

export const FULL_NAMES = {
  // Premier League 2026/27
  "Arsenal": "Arsenal", "Aston Villa": "Aston Villa", "Bournemouth": "Bournemouth", "Brentford": "Brentford",
  "Brighton": "Brighton and Hove Albion", "Chelsea": "Chelsea", "Coventry": "Coventry City",
  "Crystal Palace": "Crystal Palace", "Everton": "Everton", "Fulham": "Fulham", "Hull City": "Hull City",
  "Ipswich": "Ipswich Town", "Leeds": "Leeds United", "Liverpool": "Liverpool",
  "Manchester City": "Manchester City", "Manchester United": "Manchester United",
  "Newcastle": "Newcastle United", "Nottingham Forest": "Nottingham Forest", "Sunderland": "Sunderland",
  "Tottenham": "Tottenham Hotspur",
  // Championship 2026/27
  "Birmingham": "Birmingham City", "Blackburn": "Blackburn Rovers", "Bolton": "Bolton Wanderers",
  "Bristol City": "Bristol City", "Burnley": "Burnley", "Cardiff": "Cardiff City",
  "Charlton": "Charlton Athletic", "Derby": "Derby County", "Lincoln": "Lincoln City",
  "Middlesbrough": "Middlesbrough", "Millwall": "Millwall", "Norwich": "Norwich City",
  "Portsmouth": "Portsmouth", "Preston": "Preston North End", "QPR": "Queens Park Rangers",
  "Sheffield Utd": "Sheffield United", "Southampton": "Southampton", "Stoke City": "Stoke City",
  "Swansea": "Swansea City", "Watford": "Watford", "West Brom": "West Bromwich Albion",
  "West Ham": "West Ham United", "Wolves": "Wolverhampton Wanderers", "Wrexham": "Wrexham",
  // League One 2026/27
  "AFC Wimbledon": "AFC Wimbledon", "Barnsley": "Barnsley", "Blackpool": "Blackpool",
  "Bradford": "Bradford City", "Bromley": "Bromley", "Burton Albion": "Burton Albion",
  "Cambridge United": "Cambridge United", "Doncaster": "Doncaster Rovers",
  "Huddersfield": "Huddersfield Town", "Leicester": "Leicester City", "Leyton Orient": "Leyton Orient",
  "Luton": "Luton Town", "Mansfield Town": "Mansfield Town", "Milton Keynes Dons": "Milton Keynes Dons",
  "Notts County": "Notts County", "Oxford United": "Oxford United", "Peterborough": "Peterborough United",
  "Plymouth": "Plymouth Argyle", "Reading": "Reading", "Sheffield Wednesday": "Sheffield Wednesday",
  "Stevenage": "Stevenage", "Stockport County": "Stockport County", "Wigan": "Wigan Athletic",
  "Wycombe": "Wycombe Wanderers",
  // League Two 2026/27
  "Accrington ST": "Accrington Stanley", "Barnet": "Barnet", "Bristol Rovers": "Bristol Rovers",
  "Cheltenham": "Cheltenham Town", "Chesterfield": "Chesterfield", "Colchester": "Colchester United",
  "Crawley Town": "Crawley Town", "Crewe": "Crewe Alexandra", "Exeter City": "Exeter City",
  "Fleetwood Town": "Fleetwood Town", "Gillingham": "Gillingham", "Grimsby": "Grimsby Town",
  "Newport County": "Newport County", "Northampton": "Northampton Town", "Oldham": "Oldham Athletic",
  "Port Vale": "Port Vale", "Rochdale": "Rochdale", "Rotherham": "Rotherham United",
  "Salford City": "Salford City", "Shrewsbury": "Shrewsbury Town", "Swindon Town": "Swindon Town",
  "Tranmere": "Tranmere Rovers", "Walsall": "Walsall", "York": "York City",
};

/** The full name for display; API-Football's own name if the club isn't listed. */
export const fullClubName = (name) => FULL_NAMES[name] || name;

/** League clubs (PL and Championship games) missing from the table, for the update's report. */
export function unknownClubs(matches) {
  const names = matches.filter(m => m.comp === 'PL' || m.comp === 'CHAMP').flatMap(m => [m.homeShort, m.awayShort]);
  return [...new Set(names.filter(n => n && !FULL_NAMES[n]))].sort();
}
