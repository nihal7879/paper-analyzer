/**
 * Catalog seed: boards, curriculums, subjects, components (paper types), seasons, syllabus topics.
 * Idempotent - safe to run again (inserts or updates by natural keys).
 * Topic lists follow the published specifications; verify against the current syllabus before go-live.
 */

const SEASONS = [
  { code: 'j', name: 'January', sort_order: 0 },
  { code: 'm', name: 'Feb/March', sort_order: 1 },
  { code: 's', name: 'May/June', sort_order: 2 },
  { code: 'w', name: 'Oct/Nov', sort_order: 3 },
  { code: 'x', name: 'Specimen', sort_order: 4 },
];

const CATALOG = [
  {
    board: { code: 'CIE', name: 'Cambridge International', short_name: 'CIE' },
    curriculum: { name: 'CIE AS & A Level', level: 'AS & A Level' },
    subjects: [
      {
        code: '9702',
        name: 'Physics',
        components: [
          [1, 'Multiple Choice', 'MCQ'],
          [2, 'AS Level Structured Questions', 'THEORY'],
          [3, 'Advanced Practical Skills', 'PRACTICAL'],
          [4, 'A Level Structured Questions', 'THEORY'],
          [5, 'Planning, Analysis and Evaluation', 'THEORY'],
        ],
        topics: [
          ['1', 'Physical quantities and units'],
          ['2', 'Kinematics'],
          ['3', 'Dynamics'],
          ['4', 'Forces, density and pressure'],
          ['5', 'Work, energy and power'],
          ['6', 'Deformation of solids'],
          ['7', 'Waves'],
          ['8', 'Superposition'],
          ['9', 'Electricity'],
          ['10', 'D.C. circuits'],
          ['11', 'Particle physics'],
          ['12', 'Motion in a circle'],
          ['13', 'Gravitational fields'],
          ['14', 'Temperature'],
          ['15', 'Ideal gases'],
          ['16', 'Thermodynamics'],
          ['17', 'Oscillations'],
          ['18', 'Electric fields'],
          ['19', 'Capacitance'],
          ['20', 'Magnetic fields'],
          ['21', 'Alternating currents'],
          ['22', 'Quantum physics'],
          ['23', 'Nuclear physics'],
          ['24', 'Medical physics'],
          ['25', 'Astronomy and cosmology'],
        ],
      },
      {
        code: '9701',
        name: 'Chemistry',
        components: [
          [1, 'Multiple Choice', 'MCQ'],
          [2, 'AS Level Structured Questions', 'THEORY'],
          [3, 'Advanced Practical Skills', 'PRACTICAL'],
          [4, 'A Level Structured Questions', 'THEORY'],
          [5, 'Planning, Analysis and Evaluation', 'THEORY'],
        ],
        topics: [],
      },
      {
        code: '9700',
        name: 'Biology',
        components: [
          [1, 'Multiple Choice', 'MCQ'],
          [2, 'AS Level Structured Questions', 'THEORY'],
          [3, 'Advanced Practical Skills', 'PRACTICAL'],
          [4, 'A Level Structured Questions', 'THEORY'],
          [5, 'Planning, Analysis and Evaluation', 'THEORY'],
        ],
        topics: [],
      },
    ],
  },
  {
    board: { code: 'EDEXCEL', name: 'Pearson Edexcel', short_name: 'Edexcel' },
    curriculum: { name: 'Edexcel AS Level', level: 'AS Level' },
    subjects: [
      {
        code: '8PH0',
        name: 'Physics',
        components: [
          [1, 'Core Physics I', 'MIXED'],
          [2, 'Core Physics II', 'MIXED'],
        ],
        // Pearson Edexcel AS Physics (8PH0) specification topics.
        topics: [
          ['1', 'Working as a Physicist'],
          ['2', 'Mechanics'],
          ['3', 'Electric Circuits'],
          ['4', 'Materials'],
          ['5', 'Waves and the Particle Nature of Light'],
        ],
      },
    ],
  },
];

/** @param {import('knex').Knex} knex */
export async function seed(knex) {
  await knex('seasons').insert(SEASONS).onConflict('code').merge();

  for (const entry of CATALOG) {
    await knex('boards').insert(entry.board).onConflict('code').merge(['name', 'short_name']);
    const board = await knex('boards').where({ code: entry.board.code }).first();

    await knex('curriculums')
      .insert({ ...entry.curriculum, board_id: board.id })
      .onConflict(['board_id', 'name'])
      .merge(['level']);
    const curriculum = await knex('curriculums').where({ board_id: board.id, name: entry.curriculum.name }).first();

    for (const s of entry.subjects) {
      await knex('subjects').insert({ curriculum_id: curriculum.id, code: s.code, name: s.name }).onConflict(['curriculum_id', 'code']).merge(['name']);
      const subject = await knex('subjects').where({ curriculum_id: curriculum.id, code: s.code }).first();

      for (const [number, name, style] of s.components) {
        await knex('components').insert({ subject_id: subject.id, number, name, style }).onConflict(['subject_id', 'number']).merge(['name', 'style']);
      }

      for (const [i, [code, name]] of s.topics.entries()) {
        // parent_id NULL: MySQL unique keys treat NULLs as distinct, so look up first.
        const existing = await knex('topics').where({ subject_id: subject.id, parent_id: null, code }).first();
        if (existing) {
          await knex('topics').where({ id: existing.id }).update({ name, sort_order: i, source: 'SYLLABUS' });
        } else {
          await knex('topics').insert({ subject_id: subject.id, parent_id: null, code, name, sort_order: i, source: 'SYLLABUS' });
        }
      }
    }
  }
}
