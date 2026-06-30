import {
    buildAssessmentProgressEntries,
    collectAssignedAssessmentIds,
    findMissingAssessmentIds,
} from './sync-assigned-assessments.util';
import { Types } from 'mongoose';

describe('sync-assigned-assessments.util', () => {
    it('collects assigned ids from both sources', () => {
        const id1 = new Types.ObjectId();
        const id2 = new Types.ObjectId();
        const ids = collectAssignedAssessmentIds(
            [{ assessmentId: id1 }],
            [{ _id: id2 }],
        );
        expect(ids.sort()).toEqual([id1.toString(), id2.toString()].sort());
    });

    it('finds missing assessment ids', () => {
        const existing = ['a', 'b'];
        const assigned = ['a', 'b', 'c'];
        expect(findMissingAssessmentIds(assigned, existing)).toEqual(['c']);
    });

    it('builds not-started progress entries', () => {
        const assessmentId = new Types.ObjectId();
        const entries = buildAssessmentProgressEntries(
            [{ _id: assessmentId, sections: [{}, {}] }],
            [],
        );
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
            assessmentId,
            completedSections: 0,
            totalSections: 2,
            progressPercentage: 0,
            status: 'not_started',
        });
    });
});
