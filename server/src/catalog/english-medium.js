const ENGLISH_MEDIUM_PATHWAYS = Object.freeze([
  {
    trackId: 'cambridge-international',
    provider: 'Cambridge International Education',
    officialUrl:
      'https://www.cambridgeinternational.org/programmes-and-qualifications/',
    freeResourcePolicy:
      'Index official public syllabus and programme PDFs. Textbooks require a licensed school or user copy.',
    stages: [
      {
        id: 'cambridge-primary',
        name: 'Cambridge Primary',
        classes: [1, 2, 3, 4, 5],
        typicalAges: '5-11',
        officialUrl:
          'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-primary/',
      },
      {
        id: 'cambridge-lower-secondary',
        name: 'Cambridge Lower Secondary',
        classes: [6, 7, 8],
        typicalAges: '11-14',
        officialUrl:
          'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-lower-secondary/',
      },
      {
        id: 'cambridge-igcse-o-level',
        name: 'Cambridge IGCSE / O Level',
        classes: [9, 10],
        typicalAges: '14-16',
        officialUrl:
          'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-upper-secondary/cambridge-igcse/',
      },
      {
        id: 'cambridge-as-a-level',
        name: 'Cambridge International AS & A Level',
        classes: [11, 12],
        typicalAges: '16-19',
        officialUrl:
          'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-advanced/cambridge-international-as-and-a-levels/',
      },
    ],
  },
  {
    trackId: 'pearson-edexcel-international',
    provider: 'Pearson Edexcel',
    officialUrl:
      'https://qualifications.pearson.com/en/qualifications.html',
    freeResourcePolicy:
      'Index official public specifications and qualification guides. Textbooks require a licensed school or user copy.',
    stages: [
      {
        id: 'pearson-iprimary',
        name: 'Pearson Edexcel iPrimary',
        classes: [1, 2, 3, 4, 5],
        typicalAges: '5-11',
        officialUrl:
          'https://qualifications.pearson.com/en/qualifications/edexcel-international-primary-curriculum.html',
      },
      {
        id: 'pearson-ilower-secondary',
        name: 'Pearson Edexcel iLowerSecondary',
        classes: [6, 7, 8],
        typicalAges: '11-14',
        officialUrl:
          'https://qualifications.pearson.com/en/qualifications/edexcel-international-lower-secondary-curriculum.html',
      },
      {
        id: 'pearson-international-gcse',
        name: 'Pearson Edexcel International GCSE',
        classes: [9, 10],
        typicalAges: '14-16',
        officialUrl:
          'https://qualifications.pearson.com/en/qualifications/edexcel-international-gcses.html',
      },
      {
        id: 'pearson-international-advanced-level',
        name: 'Pearson Edexcel International AS/A Level',
        classes: [11, 12],
        typicalAges: '16-19',
        officialUrl:
          'https://qualifications.pearson.com/en/qualifications/edexcel-international-advanced-levels.html',
      },
    ],
  },
  {
    trackId: 'oxford-aqa-international',
    provider: 'OxfordAQA International Qualifications',
    officialUrl: 'https://www.oxfordaqa.com/',
    freeResourcePolicy:
      'Index official public specifications and qualification pages. Textbooks require a licensed school or user copy.',
    stages: [
      {
        id: 'oxford-international-curriculum',
        name: 'Oxford International Curriculum',
        classes: [1, 2, 3, 4, 5, 6, 7, 8],
        typicalAges: '5-14',
        officialUrl:
          'https://www.oxfordaqa.com/why-us/oxford-international-programme/',
      },
      {
        id: 'oxford-aqa-international-gcse',
        name: 'OxfordAQA International GCSE',
        classes: [9, 10],
        typicalAges: '14-16',
        officialUrl:
          'https://www.oxfordaqa.com/subjects/',
      },
      {
        id: 'oxford-aqa-as-a-level',
        name: 'OxfordAQA International AS/A Level',
        classes: [11, 12],
        typicalAges: '16-19',
        officialUrl:
          'https://www.oxfordaqa.com/subjects/',
      },
    ],
  },
]);

function classNumber(grade) {
  const match = String(grade || '').match(
    /\b(\d{1,2})\b/
  );

  return match ? Number(match[1]) : null;
}

function qualificationForProfile(trackId, grade) {
  const pathway = ENGLISH_MEDIUM_PATHWAYS.find(
    (item) => item.trackId === trackId
  );
  const number = classNumber(grade);

  if (!pathway || !number) {
    return null;
  }

  const stage = pathway.stages.find((item) =>
    item.classes.includes(number)
  );

  if (!stage) {
    return null;
  }

  return {
    trackId: pathway.trackId,
    provider: pathway.provider,
    stageId: stage.id,
    stage: stage.name,
    typicalAges: stage.typicalAges,
    officialUrl: stage.officialUrl,
    freeResourcePolicy: pathway.freeResourcePolicy,
  };
}

module.exports = {
  ENGLISH_MEDIUM_PATHWAYS,
  classNumber,
  qualificationForProfile,
};
