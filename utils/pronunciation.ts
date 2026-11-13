// How the device voice should say names it usually gets wrong.
//
// Phone and laptop voices guess at spelling, so "Kelce" comes out "Kel-kee", "Favre" as
// "Fav-ree" and "49ers" as "four nine ers". Each entry here is the name as it's written in a
// clue, and a respelling every English voice reads the right way. Only what's read aloud
// changes: the screen still shows the real spelling.
//
// To add one: put the written form on the left (exact capitals, whole words only) and a
// plain respelling on the right. Use hyphens between syllables, not periods (a period
// would end the sentence). Longer entries win over shorter ones, so "Cairo Santos" can be
// fixed without touching the city.

const PRONUNCIATIONS: [written: string, spoken: string][] = [
  // --- Teams, stadiums and schools --------------------------------------------------
  ['49ers', 'Forty-Niners'],
  ['AT&T', 'A T and T'],
  ['A&M', 'A and M'],
  ['A&T', 'A and T'],
  ['M&T', 'M and T'],
  ['NRG', 'N R G'],
  ['GEHA', 'Gee-huh'],
  ['TIAA', 'T I A A'],
  ['RCA', 'R C A'],
  ['LP Field', 'L P Field'],
  ['SoFi', 'So-Fye'],
  ['Lambeau', 'Lam-bo'],
  ['Acrisure', 'Ack-rih-shur'],
  ['USC', 'U S C'],
  ['UTEP', 'You-tep'],
  ['UNLV', 'U N L V'],
  ['UAB', 'U A B'],
  ['SMU', 'S M U'],
  ['UConn', 'You-Conn'],
  ['UMass', 'You-Mass'],
  ['Kutztown', 'Koots-town'],

  // --- Initials that some voices read as a word ---------------------------------------
  ['EJ', 'E J'],
  ['DK', 'D K'],
  ['DJ', 'D J'],
  ['AJ', 'A J'],
  ['KC Concepcion', 'K C Concepcion'],

  // --- Quarterbacks -------------------------------------------------------------------
  ['Roethlisberger', 'Roth-liss-burger'],
  ['Mahomes', 'Muh-homes'],
  ['Favre', 'Farv'],
  ['Daunte', 'Dawn-tay'],
  ['Deshaun', 'Duh-shawn'],
  ['DeShone', 'Duh-shawn'],
  ['Delhomme', 'Duh-lome'],
  ['Garoppolo', 'Guh-rop-uh-low'],
  ['Kaepernick', 'Cap-er-nick'],
  ['Mariota', 'Mare-ee-oh-tuh'],
  ['Jameis', 'Juh-mice'],
  ['Testaverde', 'Tess-tuh-vur-dee'],
  ['Tua', 'Too-uh'],
  ['Tagovailoa', 'Tung-oh-vye-low-uh'],
  ['Grbac', 'Gur-back'],
  ['Siemian', 'Sim-ee-un'],
  ['Trubisky', 'Troo-biss-key'],
  ['Beuerlein', 'Bur-line'],
  ['Esiason', 'Ee-sy-uh-sun'],
  ['Leinart', 'Line-art'],
  ['Tuiasosopo', 'Too-ee-ah-so-so-po'],
  ['Zappe', 'Zap-ee'],
  ['Shough', 'Shuck'],
  ['Shedeur', 'Sheh-door'],
  ['JaMarcus', 'Juh-mar-cus'],
  ['Akili', 'Uh-kee-lee'],
  ['Wuerffel', 'Wur-full'],
  ['Flutie', 'Floo-tee'],

  // --- Running backs ------------------------------------------------------------------
  ['LaDainian', 'Luh-day-nee-un'],
  ['Jahmyr', 'Juh-meer'],
  ['Bijan', 'Bee-jahn'],
  ['Saquon', 'Suh-kwahn'],
  ['Edgerrin', 'Edge-er-in'],
  ["Le'Veon", 'Luh-vee-on'],
  ['Kamara', 'Kuh-mar-uh'],
  ['Rhamondre', 'Ruh-mon-dray'],
  ['Achane', 'Uh-chain'],
  ['Najee', 'Nuh-jay'],
  ['Matt Forte', 'Matt For-tay'],
  ['Fournette', 'Four-net'],
  ['Etienne', 'Eh-tee-en'],
  ['Ekeler', 'Eck-ler'],
  ['Ajayi', 'Uh-jy-ee'],
  ['Charbonnet', 'Shar-bo-nay'],
  ['Allgeier', 'Al-guy-er'],
  ['Skattebo', 'Skat-uh-bo'],
  ['Bhayshul', 'Bay-shul'],
  ['Juszczyk', 'Yoos-check'],
  ['Ki-Jana', 'Kuh-jah-nuh'],

  // --- Receivers and tight ends -------------------------------------------------------
  ["Ja'Marr", 'Juh-mar'],
  ['CeeDee', 'See-Dee'],
  ['Davante', 'Duh-vawn-tay'],
  ['DeVonta', 'Duh-vawn-tay'],
  ['Tyreek', 'Tie-reek'],
  ['Amon-Ra', 'Ay-mon Rah'],
  ['Smith-Njigba', 'Smith in-jig-buh'],
  ['Puka', 'Poo-kuh'],
  ['Nacua', 'Nuh-koo-uh'],
  ['Nabers', 'Nay-burrs'],
  ['Olave', 'Oh-lahv'],
  ['Odunze', 'Oh-doon-zay'],
  ['Tetairoa', 'Teh-tie-roh-uh'],
  ['Emeka', 'Eh-meh-kuh'],
  ['Egbuka', 'Eg-boo-kuh'],
  ['Jeudy', 'Joo-dee'],
  ['McLaurin', 'Muh-lor-in'],
  ['Aiyuk', 'Eye-yook'],
  ['Thielen', 'Thee-len'],
  ['Plaxico', 'Plax-ih-co'],
  ['Burress', 'Burr-iss'],
  ['Houshmandzadeh', 'Hoosh-mon-zah-day'],
  ['Garcon', 'Gar-sohn'],
  ['Chrebet', 'Kreb-it'],
  ['Mecole', 'Muh-coal'],
  ['Kelce', 'Kel-see'],
  ['Goedert', 'Gay-dert'],
  ['Gesicki', 'Guh-sick-ee'],
  ['LaPorta', 'Luh-por-tuh'],

  // --- Defense ------------------------------------------------------------------------
  ['Ndamukong', 'En-dom-uh-kong'],
  ['Suh', 'Soo'],
  ['Jadeveon', 'Juh-dev-ee-on'],
  ['Haloti', 'Huh-low-tee'],
  ['Ngata', 'Nah-tah'],
  ["Za'Darius", 'Zuh-dare-ee-us'],
  ['Dumervil', 'Doo-mer-vill'],
  ['Kearse', 'Kurse'],
  ['Asante', 'Uh-sahn-tay'],
  ['Aqib', 'Ah-keeb'],
  ['Talib', 'Tuh-leeb'],
  ['Tyrann', 'Tie-ran'],
  ['Mathieu', 'Math-you'],
  ['Urlacher', 'Er-lack-er'],
  ['Okoye', 'Oh-koy-ay'],
  ['Polamalu', 'Poh-luh-mah-loo'],
  ['Osi', 'Oh-see'],
  ['Umenyiora', 'Oo-men-yor-uh'],
  ['Orakpo', 'Oh-rock-po'],
  ['Seau', 'Say-ow'],
  ['Lofa', 'Low-fuh'],
  ['Tatupu', 'Tah-too-poo'],
  ['Xavien', 'Zay-vee-en'],
  ['Budda', 'Boo-duh'],
  ['Lavonte', 'Luh-vawn-tay'],
  ['Strahan', 'Stray-han'],
  ['Nnamdi', 'Nahm-dee'],
  ['Asomugha', 'Ah-suh-moo-uh'],
  ['Darrelle', 'Duh-rell'],
  ['Revis', 'Rev-iss'],
  ['Kuechly', 'Keek-lee'],
  ['Byard', 'By-urd'],
  ['Minkah', 'Mink-uh'],
  ['Surtain', 'Sir-tain'],
  ['Ansah', 'Ahn-sah'],
  ['Karlaftis', 'Kar-loff-tiss'],
  ['Kiwanuka', 'Kee-wuh-noo-kuh'],
  ['Bruschi', 'Brew-ski'],
  ['Maualuga', 'Mau-uh-loo-guh'],
  ['Epenesa', 'Ep-uh-nay-suh'],
  ['Tuipulotu', 'Too-ee-poo-low-too'],
  ['Okudah', 'Oh-koo-duh'],
  ['Thibodeaux', 'Tib-uh-doe'],
  ['Talanoa', 'Tah-luh-no-uh'],
  ['Hufanga', 'Hoo-fong-uh'],
  ['Duvernay', 'Doo-ver-nay'],
  ['Sikahema', 'See-kuh-hay-muh'],

  // --- Linemen and kickers ------------------------------------------------------------
  ['Mawae', 'Muh-why'],
  ["D'Brickashaw", 'Duh-brick-uh-shaw'],
  ['Iupati', 'Yoo-pah-tee'],
  ['Wisniewski', 'Wiz-new-ski'],
  ['Kreutz', 'Kroots'],
  ['Bakhtiari', 'Bock-tee-ar-ee'],
  ['Faneca', 'Fuh-neck-uh'],
  ['Penei', 'Puh-nay'],
  ['Sewell', 'Soo-ell'],
  ['Ruettgers', 'Rut-gers'],
  ["Ka'imi", 'Kuh-ee-mee'],
  ['Fairbairn', 'Fair-barn'],
  ['Cairo Santos', 'Ky-roh Santos'],
  ['Szmyt', 'Smit'],

  // --- Coaches ------------------------------------------------------------------------
  ['Belichick', 'Bell-uh-chick'],
  ['Vrabel', 'Vray-bull'],
  ['Sirianni', 'Seer-ee-ah-nee'],
  ['Coughlin', 'Cog-lin'],
  ['Stefanski', 'Steh-fan-ski'],
  ['Steichen', 'Sty-ken'],
  ['Schottenheimer', 'Shot-en-high-mer'],
  ['Liam Coen', 'Liam Coh-en'],
  ['DeMeco', 'Duh-mee-co'],
  ['Saleh', 'Suh-lay'],
  ['Arians', 'Air-ee-unz'],
  ['Whisenhunt', 'Wiz-en-hunt'],
  ['Vermeil', 'Ver-meel'],
  ['Mariucci', 'Mare-ee-oo-chee'],
  ['Wannstedt', 'Wan-stet'],
  ['Spagnuolo', 'Span-yo-lo'],
  ['LeBeau', 'Luh-bo'],
  ['Nagy', 'Nay-ghee'],
  ['Daboll', 'Day-bull'],
  ['Koetter', 'Ket-er'],
  ['Crennel', 'Cruh-nell'],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SPOKEN = new Map(PRONUNCIATIONS);

// One pattern for the whole list, built once, so a clue is fixed in a single quick pass.
// Whole words only: "Suh" must not touch "Suhr", and "Tua" must not touch "Tuan".
const PATTERN = new RegExp(
  `(^|[^A-Za-z0-9'])(${[...SPOKEN.keys()].sort((a, b) => b.length - a.length).map(escape).join('|')})(?![A-Za-z0-9])`,
  'g'
);

/** Swaps hard names for respellings the voice reads correctly (see the list above). */
export function pronounce(text: string): string {
  return (
    text
      .replace(/[‘’]/g, "'")
      .replace(PATTERN, (_, before: string, name: string) => before + SPOKEN.get(name))
      // Any other "&" between letters reads as "and" too.
      .replace(/([A-Za-z])\s*&\s*([A-Za-z])/g, '$1 and $2')
  );
}

/** The whole list, for tests. */
export const pronunciationList = (): readonly [string, string][] => PRONUNCIATIONS;
