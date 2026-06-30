import {
    computeOverallProgressFromBuckets,
    countCompletedAnswerSections,
    deriveAssessmentProgressFromAnswers,
} from './assessment-progress.util';

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

describe('deriveAssessmentProgressFromAnswers', () => {
    it('marks fully submitted answers as submitted with 0% until CDP', () => {
        const result = deriveAssessmentProgressFromAnswers(
            [
                { layers: [{}] },
                { layers: [{}] },
            ],
            2,
        );
        expect(result.status).toBe('submitted');
        expect(result.progressPercentage).toBe(0);
    });

    it('marks mentor CDP as completed at 100%', () => {
        const result = deriveAssessmentProgressFromAnswers(
            [
                { layers: [{}], recommendations: ['Grow in prayer'] },
                { layers: [{}] },
            ],
            2,
        );
        expect(result.status).toBe('completed');
        expect(result.progressPercentage).toBe(100);
    });

    it('keeps partial answers in progress below 100%', () => {
        const result = deriveAssessmentProgressFromAnswers(
            [{ layers: [{}] }],
            2,
        );
        expect(result.status).toBe('in_progress');
        expect(result.progressPercentage).toBe(50);
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
