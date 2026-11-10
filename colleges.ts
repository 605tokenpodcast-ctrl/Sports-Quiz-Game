// College names: the question builder shows them the way a host would say them, and the
// answer checker accepts the names fans actually use ("Ole Miss", "NC State", "UCF").

/** nflverse spellings that need more than "St." -> "State". */
const DISPLAY_FIXES: Record<string, string> = {
  'Boston Col.': 'Boston College',
  'Ala-Birmingham': 'UAB',
  'Ark-Pine Bluff': 'Arkansas-Pine Bluff',
  'Middle Tenn. St.': 'Middle Tennessee State',
  'Miss. Valley St.': 'Mississippi Valley State',
  'Miami (FL)': 'Miami',
  'Miami (OH)': 'Miami of Ohio',
  'S.F. Austin': 'Stephen F. Austin',
  'Texas-El Paso': 'UTEP',
  'Southern Miss': 'Southern Miss',
  'Louisiana St.': 'LSU',
  'Southern California': 'USC',
  'Brigham Young': 'BYU',
  'Texas Christian': 'TCU',
  'Southern Methodist': 'SMU',
  'Nevada-Las Vegas': 'UNLV',
};

/** "Boston Col." -> "Boston College", "Ohio St." -> "Ohio State", "Kutztown (PA)" -> "Kutztown". */
export function collegeName(raw: string): string {
  const name = (raw || '').trim();
  if (!name || name === 'NA') return '';
  if (DISPLAY_FIXES[name]) return DISPLAY_FIXES[name];
  return name
    .replace(/\s*\([A-Z]{2}\)$/, '') // a state tag: "Central State (OH)" -> "Central State"
    .replace(/ St\.(?=\s|$)/g, ' State')
    .replace(/ Col\.$/, ' College')
    .replace(/–/g, '-')
    .trim();
}

/** Other names people say for a school (all lower case), keyed by the shown name. */
const NICKNAMES: Record<string, string[]> = {
  'Mississippi': ['ole miss'],
  'Mississippi State': ['miss state', 'mississippi st'],
  'North Carolina State': ['nc state', 'n.c. state', 'n c state'],
  'Central Florida': ['ucf'],
  'South Florida': ['usf'],
  'Florida International': ['fiu'],
  'Florida Atlantic': ['fau'],
  'Pittsburgh': ['pitt'],
  'USC': ['southern cal', 'southern california'],
  'LSU': ['louisiana state'],
  'BYU': ['brigham young'],
  'TCU': ['texas christian'],
  'SMU': ['southern methodist'],
  'UCLA': ['u c l a'],
  'UAB': ['alabama birmingham', 'alabama-birmingham'],
  'UTEP': ['texas el paso', 'texas-el paso'],
  'UNLV': ['nevada las vegas'],
  'Boston College': ['bc'],
  'Miami': ['miami florida', 'miami fl', 'the u'],
  'Miami of Ohio': ['miami ohio', 'miami oh', 'miami (ohio)'],
  'Virginia Tech': ['va tech'],
  'Georgia Tech': ['ga tech'],
  'Texas A&M': ['texas a and m', 'a and m'],
  'North Carolina A&T': ['nc a&t', 'north carolina a and t'],
  'Alabama A&M': ['alabama a and m'],
  'Southern Miss': ['southern mississippi'],
  'Stephen F. Austin': ['sfa', 's.f. austin'],
  'Washington State': ['wazzu'],
  'Penn State': ['penn st'],
  'Ohio State': ['ohio st'],
  'Middle Tennessee State': ['middle tennessee', 'mtsu'],
  'Mississippi Valley State': ['mississippi valley', 'mvsu'],
  'Arkansas-Pine Bluff': ['arkansas pine bluff', 'uapb'],
  'Appalachian State': ['app state'],
  'The Citadel': ['citadel'],
  'William & Mary': ['william and mary'],
  'Louisiana': ['louisiana lafayette', 'ul lafayette'],
};

/** Extra accepted answers for a college answer (none when it isn't a known school name). */
export function collegeAliases(answer: string): string[] {
  return NICKNAMES[collegeName(answer)] ?? [];
}
