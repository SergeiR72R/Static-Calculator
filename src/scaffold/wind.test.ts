import { describe, expect, it } from 'vitest';
import { germanWindZone, qpEN, qpGermany } from './wind';
import { DEFAULT_SCAFFOLD_OPTS, siteWind, type Site } from './store';
import { VB0_LU, belgianVb0, dutchTerrain, dutchWindArea, qpNetherlands } from './windBenelux';

describe('German wind zones by administrative boundaries (DIBt table)', () => {
  it('whole states and districts', () => {
    expect(germanWindZone({ state: 'Hessen', county: 'Landkreis Offenbach', town: 'Dreieich' })).toMatchObject({ zone: 1, sure: true });
    expect(germanWindZone({ state: 'Berlin', town: 'Berlin' })).toMatchObject({ zone: 2, sure: true });
    expect(germanWindZone({ state: 'Sachsen', county: 'Landkreis Leipzig', town: 'Grimma' })).toMatchObject({ zone: 2, sure: true });
    expect(germanWindZone({ state: 'Bayern', district: 'Unterfranken', county: 'Landkreis Würzburg', town: 'Ochsenfurt' })).toMatchObject({ zone: 1, sure: true });
    expect(germanWindZone({ state: 'Bayern', district: 'Schwaben', county: 'Landkreis Neu-Ulm', town: 'Weißenhorn' })).toMatchObject({ zone: 2, sure: true });
    expect(germanWindZone({ state: 'Bremen', town: 'Bremerhaven' })).toMatchObject({ zone: 4 });
    expect(germanWindZone({ state: 'Bremen', town: 'Bremen' })).toMatchObject({ zone: 3 });
    expect(germanWindZone({ state: 'Schleswig-Holstein', county: 'Kreis Nordfriesland', town: 'Husum' })).toMatchObject({ zone: 4, sure: true });
    expect(germanWindZone({ state: 'Niedersachsen', town: 'Emden' })).toMatchObject({ zone: 4, sure: true });
  });

  it('districts with exceptions: municipality named in the table, otherwise to be confirmed', () => {
    // Landkreis Stade: zone 3, the area Kehdingen (Freiburg, Balje, …) zone 4
    expect(germanWindZone({ state: 'Niedersachsen', county: 'Landkreis Stade', town: 'Balje' })).toMatchObject({ zone: 4, sure: true });
    expect(germanWindZone({ state: 'Niedersachsen', county: 'Landkreis Stade', town: 'Buxtehude' })).toMatchObject({ zone: 3, sure: false });
    // Kreis Ostallgäu: zone 1 for the named municipalities, zone 2 for the others
    expect(germanWindZone({ state: 'Bayern', district: 'Schwaben', county: 'Landkreis Ostallgäu', town: 'Füssen' })).toMatchObject({ zone: 1, sure: true });
    expect(germanWindZone({ state: 'Bayern', district: 'Schwaben', county: 'Landkreis Ostallgäu', town: 'Buchloe' })).toMatchObject({ zone: 2, sure: false });
  });

  it('North Rhine-Westphalia by municipality', () => {
    expect(germanWindZone({ state: 'Nordrhein-Westfalen', town: 'Düsseldorf' })).toMatchObject({ zone: 1, sure: true });
    expect(germanWindZone({ state: 'Nordrhein-Westfalen', county: 'Kreis Kleve', town: 'Goch' })).toMatchObject({ zone: 2, sure: true });
    expect(germanWindZone({ state: 'Nordrhein-Westfalen', county: 'Rhein-Sieg-Kreis', town: 'Bad Honnef' })).toMatchObject({ zone: 1, sure: true });
    expect(germanWindZone({ state: 'Nordrhein-Westfalen', county: 'Rhein-Sieg-Kreis', town: 'Alfter' })).toMatchObject({ zone: 2, sure: true });
  });

  it('places as the geocoder returns them', () => {
    expect(germanWindZone({ state: 'Nordrhein-Westfalen', town: 'Köln' })).toMatchObject({ sure: true });
    expect(germanWindZone({ state: 'Hamburg', town: 'Hamburg' })).toMatchObject({ zone: 2 });
    expect(germanWindZone({ state: 'Mecklenburg-Vorpommern', county: 'Vorpommern-Greifswald', town: 'Greifswald' })).toMatchObject({ zone: 2 });
    expect(germanWindZone({ state: 'Sachsen', town: 'Leipzig' })).toMatchObject({ zone: 2, sure: true });
  });

  it('unknown places are not guessed', () => {
    expect(germanWindZone({ state: 'Bayern', county: 'Landkreis Nirgendwo' })).toBeNull();
    expect(germanWindZone({ state: 'Tirol', town: 'Innsbruck' })).toBeNull();
  });
});

describe('peak velocity pressure', () => {
  it('Germany: simplified values of DIN EN 1991-1-4/NA up to 25 m, profiles above', () => {
    expect(qpGermany(1, 'inland', 8)).toBe(500);
    expect(qpGermany(2, 'inland', 15)).toBe(800);
    expect(qpGermany(2, 'coast', 8)).toBe(850);
    expect(qpGermany(4, 'coast', 24)).toBe(1550);
    expect(qpGermany(4, 'island', 8)).toBe(1400);
    // zone 1 has no coast
    expect(qpGermany(1, 'coast', 8)).toBe(500);
    // above 25 m: 1.7·q_b·(z/10)^0.37
    expect(qpGermany(2, 'inland', 40)).toBeCloseTo(1.7 * 390 * 4 ** 0.37, 6);
    // above 800 m: factor 0.2 + H_s/1000
    expect(qpGermany(2, 'inland', 8, 1000)).toBeCloseTo(650 * 1.2, 6);
  });

  it('EN 1991-1-4: terrain category II, 10 m: q_p = 2.35·q_b', () => {
    const qb = 0.5 * 1.25 * 25 ** 2;
    expect(qpEN(25, 'II', 10) / qb).toBeCloseTo(2.35, 1);
    expect(qpEN(25, 'III', 10)).toBeLessThan(qpEN(25, 'II', 10));
  });

  it('wind of the site: zone from the table, standing factor 0.7, by hand, indoors', () => {
    const site: Site = { query: 'Weißenhorn', name: 'Weißenhorn', lat: 48.3, lon: 10.16, country: 'de', elevation: 504, confirmed: true, admin: { state: 'Bayern', county: 'Landkreis Neu-Ulm', town: 'Weißenhorn' } };
    const o = { ...DEFAULT_SCAFFOLD_OPTS, site };
    expect(siteWind(o, 8)).toMatchObject({ zone: 2, sure: true, qp: 650, source: 'de' });
    expect(siteWind(o, 8).qMax).toBeCloseTo(455, 6);
    expect(siteWind({ ...o, standing: false }, 8).qMax).toBe(650);
    expect(siteWind({ ...o, windZone: 3 }, 8).qp).toBe(800);
    expect(siteWind({ ...o, windManual: true, qMax: 900 }, 8)).toMatchObject({ qMax: 900, source: 'manual' });
    expect(siteWind({ ...o, exposure: 'indoor' }, 8).qMax).toBe(0);
    expect(siteWind({ ...o, site: { ...site, country: 'at' } }, 8).source).toBe('none');
    expect(siteWind({ ...o, site: { ...site, country: 'at' }, vb0: 25 }, 10).source).toBe('en');
  });
});

describe('wind in the Benelux countries', () => {
  it('Netherlands: wind area by province and, in Noord-Holland, by municipality', () => {
    expect(dutchWindArea({ state: 'Noord-Holland', iso: ['NL-NH'], municipality: 'Alkmaar' })?.zone).toBe(1);
    expect(dutchWindArea({ state: 'Noord-Holland', iso: ['NL-NH'], municipality: 'Zaanstad' })?.zone).toBe(2);
    expect(dutchWindArea({ state: 'Noord-Holland', iso: ['NL-NH'], municipality: 'Heemskerk' })?.zone).toBe(2);
    expect(dutchWindArea({ state: 'Fryslân', iso: ['NL-FR'], municipality: 'Terschelling' })?.zone).toBe(1);
    expect(dutchWindArea({ state: 'Fryslân', iso: ['NL-FR'], municipality: 'Leeuwarden' })?.zone).toBe(2);
    expect(dutchWindArea({ state: 'Utrecht', iso: ['NL-UT'], town: 'Utrecht' })?.zone).toBe(3);
    // German names from the geocoder, a municipality on the boundary
    const p = dutchWindArea({ state: 'Nordholland', town: 'Purmerend' })!;
    expect(p.zone).toBe(2);
    expect(p.sure).toBe(false);
    expect(dutchWindArea({ state: 'Nordholland', town: 'Purmerend', village: 'Middenbeemster' })?.zone).toBe(1);
    expect(dutchWindArea({ state: 'Bayern' })).toBeNull();
  });

  it('Netherlands: q_p from table NB.4, height rounded up', () => {
    // published example: 7 m, area III, open country: 0.62 kN/m²
    expect(qpNetherlands(3, 'onbebouwd', 7)).toBeCloseTo(620, 6);
    expect(qpNetherlands(2, 'bebouwd', 12)).toBeCloseTo(800, 6);
    expect(qpNetherlands(1, 'kust', 30)).toBeCloseTo(1940, 6);
    // area III has no coast column
    expect(qpNetherlands(3, 'kust', 10)).toBeCloseTo(700, 6);
    expect(dutchTerrain('0')).toBe('kust');
    expect(dutchTerrain('IV')).toBe('bebouwd');
  });

  it('Belgium and Luxembourg: v_b,0 by province / for the country', () => {
    const wv = belgianVb0({ iso: ['BE-VLG', 'BE-VWV'] })!;
    expect(wv.vb0).toBe(26);
    expect(wv.sure).toBe(false);
    expect(belgianVb0({ iso: ['BE-VLG', 'BE-VAN'] })).toMatchObject({ vb0: 25, sure: true });
    expect(belgianVb0({ state: 'Région de Bruxelles-Capitale', town: 'Bruxelles' })?.vb0).toBe(25);
    expect(belgianVb0({ county: 'Luxembourg', state: 'Wallonie' })?.vb0).toBe(23);
    const base = { ...DEFAULT_SCAFFOLD_OPTS, standing: false };
    const site = (country: string, admin = {}) => ({ query: '', name: '', lat: 0, lon: 0, country, elevation: 0, confirmed: true, admin });
    const lu = siteWind({ ...base, site: site('lu') }, 10);
    expect(lu.source).toBe('lu');
    expect(lu.qp).toBeCloseTo(qpEN(VB0_LU, 'II', 10), 6);
    const be = siteWind({ ...base, site: site('be', { iso: ['BE-WLX'] }) }, 10);
    expect(be.vb0).toBe(23);
    // chosen by hand
    expect(siteWind({ ...base, windZone: 26, site: site('be', { iso: ['BE-WLX'] }) }, 10).vb0).toBe(26);
    const nl = siteWind({ ...base, site: site('nl', { iso: ['NL-UT'] }) }, 7);
    expect(nl.zone).toBe(3);
    expect(nl.qp).toBeCloseTo(620, 6);
  });
});
