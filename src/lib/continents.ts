// Static country -> continent lookup so stats don't need an external API call.
// Keys are matched case-insensitively against the `country` field on a place.
const COUNTRY_TO_CONTINENT: Record<string, string> = {
  // Africa
  algeria: 'Africa', angola: 'Africa', benin: 'Africa', botswana: 'Africa', 'burkina faso': 'Africa',
  burundi: 'Africa', cameroon: 'Africa', 'cape verde': 'Africa', 'central african republic': 'Africa',
  chad: 'Africa', comoros: 'Africa', congo: 'Africa', 'dr congo': 'Africa', 'democratic republic of the congo': 'Africa',
  djibouti: 'Africa', egypt: 'Africa', 'equatorial guinea': 'Africa', eritrea: 'Africa', eswatini: 'Africa',
  ethiopia: 'Africa', gabon: 'Africa', gambia: 'Africa', ghana: 'Africa', guinea: 'Africa',
  'guinea-bissau': 'Africa', 'ivory coast': 'Africa', "cote d'ivoire": 'Africa', kenya: 'Africa', lesotho: 'Africa',
  liberia: 'Africa', libya: 'Africa', madagascar: 'Africa', malawi: 'Africa', mali: 'Africa',
  mauritania: 'Africa', mauritius: 'Africa', morocco: 'Africa', mozambique: 'Africa', namibia: 'Africa',
  niger: 'Africa', nigeria: 'Africa', rwanda: 'Africa', 'sao tome and principe': 'Africa', senegal: 'Africa',
  seychelles: 'Africa', 'sierra leone': 'Africa', somalia: 'Africa', 'south africa': 'Africa', 'south sudan': 'Africa',
  sudan: 'Africa', tanzania: 'Africa', togo: 'Africa', tunisia: 'Africa', uganda: 'Africa',
  zambia: 'Africa', zimbabwe: 'Africa',

  // Asia
  afghanistan: 'Asia', armenia: 'Asia', azerbaijan: 'Asia', bahrain: 'Asia', bangladesh: 'Asia',
  bhutan: 'Asia', brunei: 'Asia', cambodia: 'Asia', china: 'Asia', cyprus: 'Asia',
  georgia: 'Asia', india: 'Asia', indonesia: 'Asia', iran: 'Asia', iraq: 'Asia',
  israel: 'Asia', japan: 'Asia', jordan: 'Asia', kazakhstan: 'Asia', kuwait: 'Asia',
  kyrgyzstan: 'Asia', laos: 'Asia', lebanon: 'Asia', malaysia: 'Asia', maldives: 'Asia',
  mongolia: 'Asia', myanmar: 'Asia', nepal: 'Asia', 'north korea': 'Asia', oman: 'Asia',
  pakistan: 'Asia', palestine: 'Asia', philippines: 'Asia', qatar: 'Asia', 'saudi arabia': 'Asia',
  singapore: 'Asia', 'south korea': 'Asia', 'sri lanka': 'Asia', syria: 'Asia', taiwan: 'Asia',
  tajikistan: 'Asia', thailand: 'Asia', 'timor-leste': 'Asia', turkey: 'Asia', turkmenistan: 'Asia',
  'united arab emirates': 'Asia', uzbekistan: 'Asia', vietnam: 'Asia', yemen: 'Asia',

  // Europe
  albania: 'Europe', andorra: 'Europe', austria: 'Europe', belarus: 'Europe', belgium: 'Europe',
  'bosnia and herzegovina': 'Europe', bulgaria: 'Europe', croatia: 'Europe', 'czech republic': 'Europe', czechia: 'Europe',
  denmark: 'Europe', estonia: 'Europe', finland: 'Europe', france: 'Europe', germany: 'Europe',
  greece: 'Europe', hungary: 'Europe', iceland: 'Europe', ireland: 'Europe', italy: 'Europe',
  kosovo: 'Europe', latvia: 'Europe', liechtenstein: 'Europe', lithuania: 'Europe', luxembourg: 'Europe',
  malta: 'Europe', moldova: 'Europe', monaco: 'Europe', montenegro: 'Europe', netherlands: 'Europe',
  'north macedonia': 'Europe', norway: 'Europe', poland: 'Europe', portugal: 'Europe', romania: 'Europe',
  russia: 'Europe', 'san marino': 'Europe', serbia: 'Europe', slovakia: 'Europe', slovenia: 'Europe',
  spain: 'Europe', sweden: 'Europe', switzerland: 'Europe', ukraine: 'Europe', 'united kingdom': 'Europe',
  uk: 'Europe', england: 'Europe', scotland: 'Europe', wales: 'Europe', 'vatican city': 'Europe',

  // North America
  antigua: 'North America', bahamas: 'North America', barbados: 'North America', belize: 'North America',
  canada: 'North America', 'costa rica': 'North America', cuba: 'North America', dominica: 'North America',
  'dominican republic': 'North America', 'el salvador': 'North America', grenada: 'North America',
  guatemala: 'North America', haiti: 'North America', honduras: 'North America', jamaica: 'North America',
  mexico: 'North America', nicaragua: 'North America', panama: 'North America',
  'saint kitts and nevis': 'North America', 'saint lucia': 'North America',
  'saint vincent and the grenadines': 'North America', 'trinidad and tobago': 'North America',
  'united states': 'North America', usa: 'North America', 'united states of america': 'North America',

  // South America
  argentina: 'South America', bolivia: 'South America', brazil: 'South America', chile: 'South America',
  colombia: 'South America', ecuador: 'South America', guyana: 'South America', paraguay: 'South America',
  peru: 'South America', suriname: 'South America', uruguay: 'South America', venezuela: 'South America',

  // Oceania
  australia: 'Oceania', fiji: 'Oceania', kiribati: 'Oceania', 'marshall islands': 'Oceania',
  micronesia: 'Oceania', nauru: 'Oceania', 'new zealand': 'Oceania', palau: 'Oceania',
  'papua new guinea': 'Oceania', samoa: 'Oceania', 'solomon islands': 'Oceania', tonga: 'Oceania',
  tuvalu: 'Oceania', vanuatu: 'Oceania',
}

export function continentForCountry(country: string): string {
  return COUNTRY_TO_CONTINENT[country.trim().toLowerCase()] ?? 'Unknown'
}
