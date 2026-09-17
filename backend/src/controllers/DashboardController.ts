import type { Request, Response } from 'express';
import pool from '../database/db.js';
import {
  dashboardFiltersSchema,
  validateGeographyHierarchy,
  buildStudentGeoJoins,
  buildWhereFragment,
  countModuleStudents,
  type DashboardFilters,
} from '../services/dashboard.service.js';

/**
 * GET /api/dashboard/overview
 * Returns province-wide or filtered overview KPIs.
 * Access: superuser, admin
 */
export const getOverview = async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Validate query params
    const parseResult = dashboardFiltersSchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({
        error: parseResult.error.flatten(),
      });
      return;
    }

    const filters: DashboardFilters = parseResult.data;

    // 2. Validate geography hierarchy
    const geoValidation = await validateGeographyHierarchy(filters);
    if (!geoValidation.valid) {
      res.status(400).json({ error: geoValidation.error });
      return;
    }

    // 3. Build WHERE clause (using student created_at for date filtering)
    const { whereSQL, params } = buildWhereFragment(filters, 's.created_at');
    const geoJoins = buildStudentGeoJoins('s');

    // 4. Total students
    const totalQuery = `
      SELECT COUNT(*) as total
      FROM "students" s
      ${geoJoins}
      ${whereSQL}
    `;
    const totalResult = await pool.query(totalQuery, params);
    const totalStudents = parseInt(totalResult.rows[0]?.total ?? '0', 10);

    // 5. Students by municipality
    const byMunicipalityQuery = `
      SELECT m.name as municipality_name, COUNT(s.id) as count
      FROM "students" s
      ${geoJoins}
      ${whereSQL}
      GROUP BY m.name
      ORDER BY count DESC
    `;
    const byMunicipalityResult = await pool.query(byMunicipalityQuery, params);
    const studentsByMunicipality = byMunicipalityResult.rows.map((row) => ({
      municipality_name: row.municipality_name as string,
      count: parseInt(row.count as string, 10),
    }));

    // 6. Gender distribution
    const genderQuery = `
      SELECT
        COUNT(CASE WHEN s.sex = 'Male' THEN 1 END) as male,
        COUNT(CASE WHEN s.sex = 'Female' THEN 1 END) as female
      FROM "students" s
      ${geoJoins}
      ${whereSQL}
    `;
    const genderResult = await pool.query(genderQuery, params);
    const genderDistribution = {
      male: parseInt(genderResult.rows[0]?.male ?? '0', 10),
      female: parseInt(genderResult.rows[0]?.female ?? '0', 10),
    };

    // 7. Module completion counts (parallel queries — no N+1)
    const [
      patientInfoCount,
      oralHealthCount,
      dewormingCount,
      immunizationCount,
      vitalSignsCount,
    ] = await Promise.all([
      countModuleStudents('patient_info', filters, 'mt.created_at'),
      countModuleStudents('oral_health', filters, 'mt.created_at'),
      countModuleStudents('deworming', filters, 'mt.created_at'),
      countModuleStudents('immunization', filters, 'mt.created_at'),
      countModuleStudents('vital_signs', filters, 'mt.created_at'),
    ]);

    const moduleCompletion = [
      {
        module: 'Patient Info',
        count: patientInfoCount,
        rate: totalStudents > 0 ? Math.round((patientInfoCount / totalStudents) * 100) : 0,
      },
      {
        module: 'Oral Health',
        count: oralHealthCount,
        rate: totalStudents > 0 ? Math.round((oralHealthCount / totalStudents) * 100) : 0,
      },
      {
        module: 'Deworming',
        count: dewormingCount,
        rate: totalStudents > 0 ? Math.round((dewormingCount / totalStudents) * 100) : 0,
      },
      {
        module: 'Immunization',
        count: immunizationCount,
        rate: totalStudents > 0 ? Math.round((immunizationCount / totalStudents) * 100) : 0,
      },
      {
        module: 'Vital Signs',
        count: vitalSignsCount,
        rate: totalStudents > 0 ? Math.round((vitalSignsCount / totalStudents) * 100) : 0,
      },
    ];

    // 8. Recent registrations (last 10)
    const recentQuery = `
      SELECT s.id, s.first_name, s.last_name, s.grade_level, s.created_at,
             sc.name as school_name, m.name as municipality_name
      FROM "students" s
      ${geoJoins}
      ${whereSQL}
      ORDER BY s.created_at DESC
      LIMIT 10
    `;
    const recentResult = await pool.query(recentQuery, params);
    const recentRegistrations = recentResult.rows.map((row) => ({
      id: row.id as number,
      first_name: row.first_name as string,
      last_name: row.last_name as string,
      school_name: row.school_name as string,
      municipality_name: row.municipality_name as string,
      grade_level: (row.grade_level as string) || '',
      created_at: (row.created_at as Date).toISOString(),
    }));

    // 9. Respond
    res.status(200).json({
      data: {
        total_students: totalStudents,
        students_by_municipality: studentsByMunicipality,
        gender_distribution: genderDistribution,
        module_completion: moduleCompletion,
        recent_registrations: recentRegistrations,
      },
    });
  } catch (error) {
    console.error('Dashboard overview error:', error);
    res.status(500).json({ error: 'Failed to load dashboard overview' });
  }
};
