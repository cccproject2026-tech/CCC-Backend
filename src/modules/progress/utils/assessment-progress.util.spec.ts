import { computeOverallProgressFromBuckets, countCompletedAnswerSections } from './assessment-progress.util';

describe('countCompletedAnswerSections', () => {
    it('counts only sections with layer answers', () => {
        expect(
            countCompletedAnswerSections([
                { layers: [{ selectedChoice: 'a' }] },
                { layers: [] },
                { layers: [{ selectedChoice: 'b' }] },
            ]),
        ).toBe(2);
    });

    it('returns 0 for missing sections', () => {
        expect(countCompletedAnswerSections(undefined)).toBe(0);
    });
});

describe('computeOverallProgressFromBuckets', () => {
    it('matches William Patricia S before orphan removal (80%)', () => {
        const overall = computeOverallProgressFromBuckets(100, 66.67, 2, 3);
        expect(overall).toBe(80);
    });

    it('matches William Patricia S after orphan removal (100%)', () => {
        const overall = computeOverallProgressFromBuckets(100, 100, 2, 2);
        expect(overall).toBe(100);
    });
});
