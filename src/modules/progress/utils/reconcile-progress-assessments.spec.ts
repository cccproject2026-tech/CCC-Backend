import { Types } from 'mongoose';
import { reconcileProgressAssessments } from './reconcile-progress-assessments';

describe('reconcileProgressAssessments', () => {
    const assessmentA = new Types.ObjectId();
    const assessmentB = new Types.ObjectId();
    const deletedAssessment = new Types.ObjectId();

    it('removes orphaned assessments and recalculates section counts', () => {
        const result = reconcileProgressAssessments({
            assessments: [
                {
                    assessmentId: assessmentA,
                    completedSections: 5,
                    totalSections: 5,
                    progressPercentage: 100,
                    status: 'completed',
                },
                {
                    assessmentId: assessmentB,
                    completedSections: 0,
                    totalSections: 2,
                    progressPercentage: 0,
                    status: 'not_started',
                },
                {
                    assessmentId: deletedAssessment,
                    completedSections: 0,
                    totalSections: 2,
                    progressPercentage: 0,
                    status: 'not_started',
                },
            ],
            existingAssessmentIds: new Set([
                assessmentA.toString(),
                assessmentB.toString(),
            ]),
            templateSectionCountByAssessmentId: new Map([
                [assessmentA.toString(), 5],
                [assessmentB.toString(), 5],
            ]),
            answerSectionsByAssessmentId: new Map([
                [assessmentB.toString(), [{ layers: [{}] }, { layers: [{}] }]],
            ]),
        });

        expect(result.changed).toBe(true);
        expect(result.removedOrphanIds).toEqual([deletedAssessment.toString()]);
        expect(result.assessments).toHaveLength(2);
        expect(result.assessments[1].completedSections).toBe(2);
        expect(result.assessments[1].totalSections).toBe(5);
    });
});
