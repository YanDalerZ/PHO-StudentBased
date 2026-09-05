import pool from './src/database/db.js';

/**
 * Seeds ALL 17 municipalities of Aklan with real barangays and schools.
 * Sources:
 *  - Barangays: Official PSGC / LGU data
 *  - Schools:   referrences/aklan_schools.md
 *
 * This script is idempotent — it checks before inserting.
 */

// ──────────────────────────────────────────────────────────────────────
// Barangay data for each municipality
// ──────────────────────────────────────────────────────────────────────
const BARANGAYS: Record<string, string[]> = {
    'Altavas': [
        'Cabangila', 'Cabugao', 'Catmon', 'Dalipdip', 'Dina-an',
        'Ermita', 'Guadalupe', 'Ginictan', 'Guisi', 'Habana',
        'Hongotan', 'Linayasan', 'Lumaynay', 'Lupo', 'Mabilo',
        'Odiong', 'Poblacion', 'Rosario', 'San Isidro', 'San Jose',
        'Sta. Cruz', 'Sta. Monica', 'Tibiao'
    ],
    'Balete': [
        'Aranas', 'Arcangel', 'Calizo', 'Cortes', 'Feliciano',
        'Fulgencio', 'Guanko', 'Morales', 'Oquendo', 'Poblacion'
    ],
    'Banga': [
        'Agbanawan', 'Bacan', 'Badiangan', 'Cerrudo', 'Cupang',
        'Daja Norte', 'Daja Sur', 'Dingle', 'Jumarap', 'Lapnag',
        'Libas', 'Linabuan', 'Mangan', 'Paliwan', 'Poblacion',
        'Polocate', 'Sigcay', 'Tagas', 'Torralba', 'Tugas'
    ],
    'Batan': [
        'Ambtang', 'Bay-ang', 'Cabugao', 'Caiyang', 'Camaligan',
        'Camanci', 'Cogon', 'Felicidad', 'Ipil', 'Lalab',
        'Lupit', 'Magpag-ong', 'Maguyam', 'Malay-Malay',
        'Poblacion', 'Songcolan'
    ],
    'Buruanga': [
        'Alegria', 'Bagongbayan', 'Balusbos', 'Bel-is', 'Cabugan',
        'El Progreso', 'Habana', 'Katipunan', 'Mayapay', 'Nazareth',
        'Panilongan', 'Poblacion', 'Santander', 'Tag-osip',
        'Tigum', 'Tuno'
    ],
    'Ibajay': [
        'Agbago', 'Aquino', 'Aslum', 'Bakyang', 'Batobato',
        'Bugtong Bato', 'Cabatanga', 'Colongcolong', 'Laguinbanua',
        'Maloco', 'Mina-ga', 'Monlake', 'Naisud', 'Naligusan',
        'Ondoy', 'Poblacion', 'Regador', 'Rivera', 'Rizal',
        'San Isidro', 'Santa Cruz', 'Santa Monica', 'Tagbaya',
        'Tul-ang', 'Ugsod', 'Yawan'
    ],
    // Kalibo already has 16 barangays seeded — we will skip it
    'Lezo': [
        'Agcawilan', 'Bagto', 'Bugasongan', 'Carugdog',
        'Cogon', 'Ibao', 'Mina', 'Poblacion', 'Sta. Cruz',
        'Sta. Cruz Bigaa', 'Silakat-Nonok', 'Tayhawan'
    ],
    'Libacao': [
        'Agmanic', 'Aranguel', 'Bagacay', 'Batobato',
        'Bonza', 'Calacabian', 'Casit-an', 'Dalagsa-an',
        'Guadalupe', 'Janlud', 'Julita', 'Luctoga',
        'Madalag', 'Magubahay', 'Malabon', 'Manhanip',
        'Obo-ob', 'Poblacion', 'Rosal', 'San Isidro',
        'San Jose', 'Santa Monica', 'Tina', 'Tubudan'
    ],
    'Madalag': [
        'Alaminos', 'Alas-as', 'Bacyang', 'Balactasan',
        'Cabangahan', 'Cabilawan', 'Catabana', 'Dit-an',
        'Galicia', 'Guadalupe', 'Logohon', 'Madalag Proper',
        'Mamba', 'Maria Cristina', 'Medina', 'Mercedes',
        'Napnapan', 'Pang-itan', 'Pato-o', 'Poblacion',
        'San Jose', 'San Julian', 'Santa Monica', 'Singay',
        'Talangban', 'Talibon', 'Tigbawan'
    ],
    'Makato': [
        'Agbalogo', 'Aglucay', 'Alibagon', 'Bagong Barrio',
        'Baybay', 'Cabatanga', 'Calangcang', 'Castillo',
        'Cayangwan', 'Cogon', 'Dumga', 'Libang',
        'Lilo-an', 'Poblacion', 'Tiguib', 'Tugas'
    ],
    'Malay': [
        'Argao', 'Balabag', 'Balusbus', 'Cagban',
        'Caticlan', 'Cogon', 'Cubay Norte', 'Cubay Sur',
        'Dumlog', 'Manoc-Manoc', 'Motag', 'Naasug',
        'Nabaoy', 'Napaan', 'Poblacion', 'San Vicenteng Silangan',
        'Yapak'
    ],
    'Malinao': [
        'Balalunog', 'Banbanan', 'Bato', 'Binanu-an',
        'Cabugao', 'Cogon', 'Daguitan', 'Jagnaya',
        'Lanas', 'Loy-a', 'Lupo', 'Maganhop',
        'Makato', 'Maloco', 'Mambog', 'Napnot',
        'Ondoy', 'Poblacion', 'San Isidro', 'Tabon'
    ],
    'Nabas': [
        'Alimbo-Baybay', 'Buenafortuna', 'Bulwang',
        'Castillo', 'Gibon', 'Hongotan', 'Ibaan',
        'Kaano', 'Magpag-ong', 'Napti', 'Pawa',
        'Pinamuk-an', 'Poblacion', 'Rizal', 'Solido',
        'Tagororoc', 'Tul-ang', 'Union'
    ],
    'New Washington': [
        'Bagumbayan', 'Polo', 'Candelaria', 'Cawayan',
        'Dumaguit', 'Fatima', 'Guinbaliwan', 'Jalas',
        'Jugas', 'Lawa-an', 'Mabilo', 'Mabini',
        'Mataphao', 'Ochando', 'Pinamuk-an', 'Poblacion',
        'Progreso', 'Rivera', 'Rizal', 'Tambak'
    ],
    'Numancia': [
        'Albasan', 'Aliputos', 'Badio', 'Bakhaw',
        'Baybay', 'Buenasuerte', 'Caano', 'Camanci Norte',
        'Camanci Sur', 'Dongon East', 'Dongon West',
        'Habana', 'Nawili', 'Poblacion', 'Progreso'
    ],
    'Tangalan': [
        'Afga', 'Bayang', 'Dapdap', 'Dumatad',
        'Jawili', 'Lanipga', 'Napatag', 'Panayakan',
        'Poblacion', 'Pudiot', 'Tagas', 'Tamalagon',
        'Tamokoe', 'Tondog', 'Vivo'
    ]
};

// ──────────────────────────────────────────────────────────────────────
// School data mapped by municipality. Each school has a name and a
// target barangay (the first matching barangay found in the DB).
// ──────────────────────────────────────────────────────────────────────
interface SchoolEntry {
    name: string;
    barangay: string; // must match a barangay name in the same municipality
    district?: string;
}

const SCHOOLS: Record<string, SchoolEntry[]> = {
    'Kalibo': [
        // Already seeded: Kalibo Elementary School, Aklan National High School
        // Add the rest from reference
        { name: 'Regional Science High School for Region VI', barangay: 'Andagao', district: 'Kalibo' },
        { name: 'Aklan Academy', barangay: 'Poblacion', district: 'Kalibo' },
        { name: 'Aklan Valley High School', barangay: 'Poblacion', district: 'Kalibo' },
        { name: 'Christ the King School', barangay: 'Poblacion', district: 'Kalibo' },
        { name: 'Dela Cruz Institute', barangay: 'Poblacion', district: 'Kalibo' },
        { name: 'Infant Jesus Academy', barangay: 'Poblacion', district: 'Kalibo' },
        { name: 'Kalibo Institute', barangay: 'Poblacion', district: 'Kalibo' },
        { name: 'Linabuan National High School', barangay: 'Linabuan Norte', district: 'Kalibo' },
        { name: 'Marian High School', barangay: 'Poblacion', district: 'Kalibo' },
        { name: 'Nalook National High School', barangay: 'Nalook', district: 'Kalibo' },
        { name: 'Starglow Learning Center', barangay: 'Poblacion', district: 'Kalibo' },
        { name: 'Wadeford School', barangay: 'Poblacion', district: 'Kalibo' },
        { name: 'Aklan National High School for Arts and Trades', barangay: 'Andagao', district: 'Kalibo' },
        // Colleges
        { name: 'Aklan Catholic College', barangay: 'Poblacion', district: 'Kalibo' },
        { name: 'Aklan Polytechnic College', barangay: 'Poblacion', district: 'Kalibo' },
        { name: 'Garcia College of Technology', barangay: 'Poblacion', district: 'Kalibo' },
        { name: 'Panay Technological College', barangay: 'Poblacion', district: 'Kalibo' },
        { name: 'STI College Kalibo', barangay: 'Poblacion', district: 'Kalibo' },
        { name: 'Central Panay College of Science and Technology', barangay: 'Poblacion', district: 'Kalibo' },
        { name: 'Saint Gabriel College', barangay: 'Poblacion', district: 'Kalibo' },
        { name: 'Verde Grande College', barangay: 'Poblacion', district: 'Kalibo' },
        // Elementary schools
        { name: 'Andagao Elementary School', barangay: 'Andagao', district: 'Kalibo' },
        { name: 'Bakhaw-Old Buswang Elementary School', barangay: 'Bakhaw Norte', district: 'Kalibo' },
        { name: 'Caano Elementary School', barangay: 'Caano', district: 'Kalibo' },
        { name: 'Estancia Elementary School', barangay: 'Estancia', district: 'Kalibo' },
        { name: 'General F. Castillo Memorial School', barangay: 'Poblacion', district: 'Kalibo' },
        { name: 'Kalibo Pilot Elementary School', barangay: 'Poblacion', district: 'Kalibo' },
        { name: 'Linabuan Norte Elementary School', barangay: 'Linabuan Norte', district: 'Kalibo' },
        { name: 'Mobo Elementary School', barangay: 'Mobo', district: 'Kalibo' },
        { name: 'Nalook Elementary School', barangay: 'Nalook', district: 'Kalibo' },
        { name: 'New Buswang Elementary School', barangay: 'Buswang New', district: 'Kalibo' },
        { name: 'Pook Elementary School', barangay: 'Pook', district: 'Kalibo' },
        { name: 'Tinigaw Elementary School', barangay: 'Tinigaw', district: 'Kalibo' },
        { name: 'Tigayon Elementary School', barangay: 'Tigayon', district: 'Kalibo' },
        { name: 'Kalibo Integrated Special Education Center', barangay: 'Poblacion', district: 'Kalibo' },
    ],
    'Altavas': [
        { name: 'Altavas National School', barangay: 'Poblacion', district: 'Altavas' },
        { name: 'Altavas College', barangay: 'Poblacion', district: 'Altavas' },
        { name: 'Altavas Elementary School', barangay: 'Poblacion', district: 'Altavas' },
        { name: 'Cabangila Elementary School', barangay: 'Cabangila', district: 'Altavas' },
        { name: 'Cabugao Elementary School', barangay: 'Cabugao', district: 'Altavas' },
        { name: 'Dalipdip Elementary School', barangay: 'Dalipdip', district: 'Altavas' },
        { name: 'Ginictan Elementary School', barangay: 'Ginictan', district: 'Altavas' },
        { name: 'Guisi Elementary School', barangay: 'Guisi', district: 'Altavas' },
        { name: 'Hongoton Elementary School', barangay: 'Hongoton', district: 'Altavas' },
        { name: 'Linayasan Elementary School', barangay: 'Linayasan', district: 'Altavas' },
        { name: 'Lumaynay Elementary School', barangay: 'Lumaynay', district: 'Altavas' },
        { name: 'Lupo Elementary School', barangay: 'Lupo', district: 'Altavas' },
        { name: 'Odiong Elementary School', barangay: 'Odiong', district: 'Altavas' },
        { name: 'Father Julian C. Rago Memorial National High School', barangay: 'Poblacion', district: 'Altavas' },
    ],
    'Banga': [
        { name: 'Aklan State University - Main Campus', barangay: 'Poblacion', district: 'Banga' },
        { name: 'Banga Elementary School', barangay: 'Poblacion', district: 'Banga' },
        { name: 'Bacan Elementary School', barangay: 'Bacan', district: 'Banga' },
        { name: 'Badiangan Elementary School', barangay: 'Badiangan', district: 'Banga' },
        { name: 'Daja Norte Elementary School', barangay: 'Daja Norte', district: 'Banga' },
        { name: 'Daja Sur Elementary School', barangay: 'Daja Sur', district: 'Banga' },
        { name: 'Dingle Elementary School', barangay: 'Dingle', district: 'Banga' },
        { name: 'Mangan Elementary School', barangay: 'Mangan', district: 'Banga' },
        { name: 'Polocate Elementary School', barangay: 'Polocate', district: 'Banga' },
        { name: 'Sigcay Elementary School', barangay: 'Sigcay', district: 'Banga' },
        { name: 'Torralba Elementary School', barangay: 'Torralba', district: 'Banga' },
        { name: 'Mangan National High School', barangay: 'Mangan', district: 'Banga' },
    ],
    'Balete': [
        { name: 'Balete Community College', barangay: 'Poblacion', district: 'Balete' },
        { name: 'Calizo Elementary School', barangay: 'Calizo', district: 'Balete' },
        { name: 'Feliciano Elementary School', barangay: 'Feliciano', district: 'Balete' },
        { name: 'Guanko Elementary School', barangay: 'Guanko', district: 'Balete' },
        { name: 'Morales Elementary School', barangay: 'Morales', district: 'Balete' },
        { name: 'Oquendo Elementary School', barangay: 'Oquendo', district: 'Balete' },
    ],
    'Batan': [
        { name: 'Batan Community College', barangay: 'Poblacion', district: 'Batan' },
        { name: 'Batan Elementary School', barangay: 'Poblacion', district: 'Batan' },
    ],
    'Buruanga': [
        { name: 'Buruanga Elementary School', barangay: 'Poblacion', district: 'Buruanga' },
    ],
    'Ibajay': [
        { name: 'Aklan State University - Ibajay Campus', barangay: 'Poblacion', district: 'Ibajay' },
        { name: 'Regador Elementary School', barangay: 'Regador', district: 'Ibajay' },
        { name: 'Rizal Elementary School', barangay: 'Rizal', district: 'Ibajay' },
        { name: 'San Isidro Elementary School', barangay: 'San Isidro', district: 'Ibajay' },
        { name: 'Jose Borromeo Legaspi Memorial National High School', barangay: 'Poblacion', district: 'Ibajay' },
    ],
    'Lezo': [
        { name: 'Lezo Elementary School', barangay: 'Poblacion', district: 'Lezo' },
    ],
    'Libacao': [
        { name: 'Libacao College of Science and Technology', barangay: 'Poblacion', district: 'Libacao' },
        { name: 'Libacao National Forestry Vocational High School', barangay: 'Poblacion', district: 'Libacao' },
        { name: 'Guadalupe National High School', barangay: 'Guadalupe', district: 'Libacao' },
        { name: 'Dalagsaan Integrated School', barangay: 'Dalagsa-an', district: 'Libacao' },
    ],
    'Madalag': [
        { name: 'Alaminos Elementary School', barangay: 'Alaminos', district: 'Madalag' },
        { name: 'Balactasan Elementary School', barangay: 'Balactasan', district: 'Madalag' },
    ],
    'Makato': [
        { name: 'Aklan State University - Makato Campus', barangay: 'Poblacion', district: 'Makato' },
        { name: 'Lamberto H. Tirol National High School', barangay: 'Poblacion', district: 'Makato' },
    ],
    'Malay': [
        { name: 'Malay College', barangay: 'Poblacion', district: 'Malay' },
        { name: 'Sofronio R. Palabrica Sr. National High School', barangay: 'Poblacion', district: 'Malay' },
    ],
    'Malinao': [
        { name: 'Lupo National High School', barangay: 'Lupo', district: 'Malinao' },
        { name: 'Jose Feliciano Meñez Memorial National High School', barangay: 'Poblacion', district: 'Malinao' },
    ],
    'Nabas': [
        { name: 'Nabas Elementary School', barangay: 'Poblacion', district: 'Nabas' },
    ],
    'New Washington': [
        { name: 'Aklan State University - New Washington Campus', barangay: 'Poblacion', district: 'New Washington' },
        { name: 'Numancia Integrated School', barangay: 'Poblacion', district: 'New Washington' },
    ],
    'Numancia': [
        { name: 'Aguinaldo T. Repiedad Sr. Integrated School', barangay: 'Poblacion', district: 'Numancia' },
        { name: 'Bakhaw Norte Integrated School', barangay: 'Bakhaw', district: 'Numancia' },
    ],
    'Tangalan': [
        { name: 'Tangalan Elementary School', barangay: 'Poblacion', district: 'Tangalan' },
    ],
};

async function seed() {
    console.log('🚀 Starting comprehensive barangay & school seed...\n');

    // 1. Get all municipalities with their IDs
    const munResult = await pool.query('SELECT id, name FROM MUNICIPALITIES ORDER BY id');
    const munMap = new Map<string, number>();
    for (const row of munResult.rows) {
        munMap.set(row.name, row.id);
    }
    console.log(`Found ${munMap.size} municipalities.\n`);

    // 2. Insert barangays for each municipality (skip Kalibo, already has 16)
    let totalBgys = 0;
    for (const [munName, bgys] of Object.entries(BARANGAYS)) {
        const munId = munMap.get(munName);
        if (!munId) {
            console.warn(`⚠️  Municipality "${munName}" not found in DB. Skipping.`);
            continue;
        }

        // Check how many barangays already exist
        const existing = await pool.query(
            'SELECT COUNT(*) FROM BARANGAYS WHERE municipality_id = $1',
            [munId]
        );
        if (parseInt(existing.rows[0].count) > 0) {
            console.log(`  ⏭️  ${munName} already has ${existing.rows[0].count} barangays. Skipping.`);
            continue;
        }

        // Build batch INSERT
        const values: string[] = [];
        const params: (string | number)[] = [];
        let paramIdx = 1;
        for (const bgy of bgys) {
            values.push(`($${paramIdx++}, $${paramIdx++})`);
            params.push(bgy, munId);
        }

        await pool.query(
            `INSERT INTO BARANGAYS (name, municipality_id) VALUES ${values.join(', ')}`,
            params
        );
        totalBgys += bgys.length;
        console.log(`  ✅ ${munName}: inserted ${bgys.length} barangays.`);
    }
    console.log(`\n📊 Total new barangays inserted: ${totalBgys}\n`);

    // 3. Insert schools
    let totalSchools = 0;
    for (const [munName, schoolList] of Object.entries(SCHOOLS)) {
        const munId = munMap.get(munName);
        if (!munId) {
            console.warn(`⚠️  Municipality "${munName}" not found in DB for schools. Skipping.`);
            continue;
        }

        for (const school of schoolList) {
            // Check if school already exists by name
            const existingSchool = await pool.query(
                'SELECT id FROM SCHOOLS WHERE name = $1',
                [school.name]
            );
            if (existingSchool.rows.length > 0) {
                continue; // Already exists
            }

            // Find the barangay_id
            const bgyResult = await pool.query(
                'SELECT id FROM BARANGAYS WHERE name = $1 AND municipality_id = $2',
                [school.barangay, munId]
            );

            if (bgyResult.rows.length === 0) {
                console.warn(`  ⚠️  Barangay "${school.barangay}" not found in ${munName} for school "${school.name}". Skipping.`);
                continue;
            }

            const bgyId = bgyResult.rows[0].id;
            await pool.query(
                'INSERT INTO SCHOOLS (name, address, barangay_id, district) VALUES ($1, $2, $3, $4)',
                [school.name, `${school.barangay}, ${munName}`, bgyId, school.district || munName]
            );
            totalSchools++;
        }
        console.log(`  ✅ ${munName}: schools processed.`);
    }

    console.log(`\n📊 Total new schools inserted: ${totalSchools}`);

    // 4. Final summary
    const bgyCount = await pool.query('SELECT COUNT(*) FROM BARANGAYS');
    const schoolCount = await pool.query('SELECT COUNT(*) FROM SCHOOLS');
    console.log(`\n🎉 Seed complete! DB now has ${bgyCount.rows[0].count} barangays and ${schoolCount.rows[0].count} schools.`);

    process.exit(0);
}

seed().catch(err => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
});
