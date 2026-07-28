const NCTB_CATALOGS = Object.freeze([
  {
    id: 'nctb-2026-class-1',
    grade: 'Class 1',
    academicYear: '2026',
    url: 'https://nctb.gov.bd/pages/static-pages/695b9adec4774958d7b708cd',
  },
  {
    id: 'nctb-2026-class-2',
    grade: 'Class 2',
    academicYear: '2026',
    url: 'https://nctb.gov.bd/pages/static-pages/695b9935c4774958d7b70508',
  },
  {
    id: 'nctb-2026-class-3',
    grade: 'Class 3',
    academicYear: '2026',
    url: 'https://nctb.gov.bd/pages/static-pages/695b9980c4774958d7b70591',
  },
  {
    id: 'nctb-2026-class-4',
    grade: 'Class 4',
    academicYear: '2026',
    url: 'https://nctb.gov.bd/pages/static-pages/695b99ccc4774958d7b70680',
  },
  {
    id: 'nctb-2026-class-5',
    grade: 'Class 5',
    academicYear: '2026',
    url: 'https://nctb.gov.bd/pages/static-pages/695b9a68c4774958d7b707a5',
  },
  {
    id: 'nctb-2026-class-6',
    grade: 'Class 6',
    academicYear: '2026',
    url: 'https://nctb.gov.bd/pages/static-pages/695b987ac4774958d7b7040b',
  },
  {
    id: 'nctb-2026-class-7',
    grade: 'Class 7',
    academicYear: '2026',
    url: 'https://nctb.gov.bd/pages/static-pages/695b9aeec4774958d7b70908',
  },
  {
    id: 'nctb-2026-class-8',
    grade: 'Class 8',
    academicYear: '2026',
    url: 'https://nctb.gov.bd/pages/static-pages/695b9858c4774958d7b703d8',
  },
  {
    id: 'nctb-2026-class-9-10',
    grade: 'Class 9-10',
    academicYear: '2026',
    url: 'https://nctb.gov.bd/pages/static-pages/695b99afc4774958d7b70612',
  },
  {
    id: 'nctb-higher-secondary',
    grade: 'Class 11-12',
    academicYear: 'Current official listing',
    url: 'https://nctb.gov.bd/pages/static-pages/6922e145933eb65569e2b37b',
  },
]);

const BANGLADESH_CURRICULA = Object.freeze([
  {
    id: 'nctb-bangla-version',
    name: 'Bangladesh NCTB - Bangla Version',
    country: 'Bangladesh',
    grades: '1-12',
    access: 'official-free-textbooks',
    contentPolicy:
      'Index official NCTB publications with page citations.',
    catalogUrl:
      'https://nctb.gov.bd/pages/publications',
  },
  {
    id: 'nctb-english-version',
    name: 'Bangladesh NCTB - English Version',
    country: 'Bangladesh',
    grades: '1-12',
    access: 'official-free-textbooks',
    contentPolicy:
      'Index official NCTB English-version publications with page citations.',
    catalogUrl:
      'https://nctb.gov.bd/pages/publications',
  },
  {
    id: 'cambridge-international-bangladesh',
    name: 'Cambridge International in Bangladesh',
    country: 'Bangladesh',
    grades: '1-12',
    access: 'public-syllabuses-and-licensed-resources',
    contentPolicy:
      'Index public official syllabuses. Import textbooks only from licensed school or user copies.',
    catalogUrl:
      'https://www.cambridgeinternational.org/programmes-and-qualifications/',
  },
  {
    id: 'pearson-edexcel-bangladesh',
    name: 'Pearson Edexcel International in Bangladesh',
    country: 'Bangladesh',
    grades: '1-12',
    access: 'public-specifications-and-licensed-resources',
    contentPolicy:
      'Index public official specifications. Import textbooks only from licensed school or user copies.',
    catalogUrl:
      'https://qualifications.pearson.com/en/qualifications/edexcel-international-advanced-levels.html',
  },
  {
    id: 'oxford-aqa-bangladesh',
    name: 'OxfordAQA International in Bangladesh',
    country: 'Bangladesh',
    grades: '9-12',
    access: 'public-specifications-and-licensed-resources',
    contentPolicy:
      'Index public official specifications. Import textbooks only from licensed school or user copies.',
    catalogUrl:
      'https://www.oxfordaqa.com/qualifications/',
  },
]);

module.exports = {
  BANGLADESH_CURRICULA,
  NCTB_CATALOGS,
};
