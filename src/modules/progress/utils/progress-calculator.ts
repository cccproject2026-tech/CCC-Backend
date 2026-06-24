import { PROGRESS_STATUSES } from '../../../common/constants/status.constants';

/** Recomputes roadmap/assessment/overall fields on an in-memory progress document. */
export function calculateProgress(doc: any): void {
    let totalRoadmapPercent = 0;
    let totalAssessmentPercent = 0;

    // --- Roadmaps ---
    let completedRoadmaps = 0;
    doc.roadmaps.forEach((r: any) => {
        let hasNestedInProgress = false;
        let hasNestedCompleted = false;
        let hasNestedSubmitted = false;

        if (r.nestedRoadmaps && r.nestedRoadmaps.length > 0) {
            r.nestedRoadmaps.forEach((nested: any) => {
                if (nested.totalSteps > 0)
                    nested.progressPercentage = Math.min((nested.completedSteps / nested.totalSteps) * 100, 100);
                else nested.progressPercentage = 0;

                const wasSubmitted = nested.status === PROGRESS_STATUSES.SUBMITTED;

                if (nested.progressPercentage >= 100) {
                    nested.status = PROGRESS_STATUSES.COMPLETED;
                    hasNestedCompleted = true;
                } else if (wasSubmitted) {
                    nested.status = PROGRESS_STATUSES.SUBMITTED;
                    hasNestedSubmitted = true;
                } else if (nested.progressPercentage > 0) {
                    nested.status = PROGRESS_STATUSES.IN_PROGRESS;
                    hasNestedInProgress = true;
                } else {
                    nested.status = PROGRESS_STATUSES.NOT_STARTED;
                }
            });
        }

        if (r.totalSteps > 0)
            r.progressPercentage = Math.min((r.completedSteps / r.totalSteps) * 100, 100);
        else r.progressPercentage = 0;

        if (r.progressPercentage >= 100) {
            r.status = PROGRESS_STATUSES.COMPLETED;
        } else if (
            r.progressPercentage > 0 ||
            hasNestedInProgress ||
            hasNestedCompleted ||
            hasNestedSubmitted
        ) {
            r.status = PROGRESS_STATUSES.IN_PROGRESS;
        } else {
            r.status = PROGRESS_STATUSES.NOT_STARTED;
        }

        totalRoadmapPercent += r.progressPercentage;
        if (r.status === PROGRESS_STATUSES.COMPLETED) completedRoadmaps++;
    });

    doc.totalRoadmaps = doc.roadmaps.length;
    doc.completedRoadmaps = completedRoadmaps;
    doc.overallRoadmapProgress =
        doc.roadmaps.length > 0
            ? parseFloat((totalRoadmapPercent / doc.roadmaps.length).toFixed(2))
            : 0;

    // --- Assessments ---
    let completedAssessments = 0;
    doc.assessments.forEach((a: any) => {
        if (a.totalSections > 0)
            a.progressPercentage = Math.min((a.completedSections / a.totalSections) * 100, 100);
        else a.progressPercentage = 0;

        if (a.progressPercentage >= 100) a.status = PROGRESS_STATUSES.COMPLETED;
        else if (a.progressPercentage > 0) a.status = PROGRESS_STATUSES.IN_PROGRESS;
        else a.status = PROGRESS_STATUSES.NOT_STARTED;

        totalAssessmentPercent += a.progressPercentage;
        if (a.status === PROGRESS_STATUSES.COMPLETED) completedAssessments++;
    });

    doc.totalAssessments = doc.assessments.length;
    doc.completedAssessments = completedAssessments;
    doc.overallAssessmentProgress =
        doc.assessments.length > 0
            ? parseFloat((totalAssessmentPercent / doc.assessments.length).toFixed(2))
            : 0;

    doc.totalItems = doc.totalRoadmaps + doc.totalAssessments;
    doc.completedItems = doc.completedRoadmaps + doc.completedAssessments;

    if (doc.totalItems > 0) {
        const roadmapWeight = doc.totalRoadmaps / doc.totalItems;
        const assessmentWeight = doc.totalAssessments / doc.totalItems;

        doc.overallProgress = parseFloat(
            (
                (doc.overallRoadmapProgress * roadmapWeight) +
                (doc.overallAssessmentProgress * assessmentWeight)
            ).toFixed(2)
        );
    } else {
        doc.overallProgress = 0;
    }
    doc.overallCompleted = doc.overallProgress >= 100;
}
