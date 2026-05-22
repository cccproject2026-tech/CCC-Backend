import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Assessment, AssessmentDocument } from './schemas/assessment.schema';
import { CreateAssessmentDto, SectionDto, SectionRecommendationDto, SectionRecommendationPreviewDto, SectionRecommendationRuleDto, UpdateAssessmentDto } from './dto/assessment.dto';
import { User, UserDocument } from '../users/schemas/user.schema';
import { ASSESSMENT_ASSIGNMENT_STATUSES } from '../../common/constants/status.constants';
import { UserAnswer } from './schemas/answer.schema';
import { SubmitSectionAnswersDto } from './dto/submit-section-answers.dto';
import { SubmitPreSurveyDto } from './dto/submit-pre-survey.dto';
import { Progress, ProgressDocument } from '../progress/schemas/progress.schema';
import { S3Service } from '../s3/s3.service';
import { calculateSectionScore } from './utils/assessment.utils';
import { AssessmentAssigned, AssessmentAssignedDocument } from './schemas/assessment_assigned';
import { HomeService } from '../home/home.service';
import { MailerService } from '../../common/utils/mail.util';
import { ROLES } from '../../common/constants/roles.constants';
import { assessmentSectionRecommendationNotification } from '../../common/utils/notification-copy.util';

@Injectable()
export class AssessmentService {
  constructor(
    @InjectModel(Assessment.name)
    private readonly assessmentModel: Model<AssessmentDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(UserAnswer.name)
    private readonly userAnswerModel: Model<UserAnswer>,
    @InjectModel(Progress.name)
    private readonly progressModel: Model<ProgressDocument>,
    private readonly s3Service: S3Service,
    @InjectModel(AssessmentAssigned.name)
    private assessmentAssignedModel: Model<AssessmentAssignedDocument>,
    private readonly notificationService: HomeService,
    private readonly mailer: MailerService,
  ) { }

  private isPastoralLearnerRole(role?: string): boolean {
    const r = (role ?? '').trim().toLowerCase();
    return r === ROLES.PASTOR || r === ROLES.LAY_LEADER || r === ROLES.SEMINARIAN;
  }

  private isMentorTrackRole(role?: string): boolean {
    const r = (role ?? '').trim().toLowerCase();
    return r === ROLES.MENTOR || r === ROLES.FIELD_MENTOR;
  }
  async create(dto: CreateAssessmentDto): Promise<Assessment> {
    const newAssessment = await this.assessmentModel.create({
      ...dto,
      roadmapId: dto.roadmapId ? new Types.ObjectId(dto.roadmapId) : undefined,
    });
    return newAssessment;
  }

  async getAll(): Promise<Assessment[]> {
    return this.assessmentModel
      .find()
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async getById(id: string): Promise<Assessment> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid assessment ID format');
    }

    const assessment = await this.assessmentModel
      .findById(id)
      .lean()
      .exec();
    if (!assessment) throw new NotFoundException('Assessment not found');
    return assessment;
  }

  async deleteMany(ids: string[]) {
    const invalidIds = ids.filter(id => !Types.ObjectId.isValid(id));

    if (invalidIds.length) {
      throw new BadRequestException('Invalid assessment ID(s)');
    }

    return this.assessmentModel.deleteMany({
      _id: { $in: ids },
    });
  }

  async updateAssessment(
    id: string,
    updates: UpdateAssessmentDto,
  ): Promise<Assessment> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid assessment ID format');
    }

    if (!updates || Object.keys(updates).length === 0) {
      throw new BadRequestException('No update data provided');
    }

    const assessment = await this.assessmentModel
      .findByIdAndUpdate(id, updates, {
        new: true,
        runValidators: true,
      })
      .exec();

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    return assessment;
  }

  async updateSections(
    id: string,
    sections: SectionDto[],
  ): Promise<Assessment> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid assessment ID format');
    }

    const assessment = await this.assessmentModel
      .findByIdAndUpdate(id, { sections }, { new: true })
      .lean()
      .exec();
    if (!assessment) throw new NotFoundException('Assessment not found');
    return assessment;
  }

  // Assign assessment to multiple users
  async assignAssessmentToUsers(assessmentId: string, userIds: string[]) {
    if (!Types.ObjectId.isValid(assessmentId)) {
      throw new BadRequestException('Invalid assessment ID format');
    }

    const invalidIds = userIds.filter((id) => !Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      throw new BadRequestException(`Invalid user IDs: ${invalidIds.join(', ')}`);
    }

    const assessment = await this.assessmentModel.findById(assessmentId).exec();
    if (!assessment) throw new NotFoundException('Assessment not found');

    type AssignUserLean = Pick<UserDocument, 'email' | 'firstName' | 'lastName' | 'role'> & {
      _id: Types.ObjectId;
      assignedId?: Types.ObjectId[];
    };

    const validUsers = (await this.userModel
      .find({
        _id: { $in: userIds.map((id) => new Types.ObjectId(id)) },
      })
      .select('_id email firstName lastName role assignedId')
      .lean()
      .exec()) as AssignUserLean[];

    if (validUsers.length === 0) {
      throw new BadRequestException('No valid users found');
    }

    const alreadyAssignedIds = new Set(
      assessment.assignments.map((a) => a.userId.toString()),
    );
    const newUsers = validUsers.filter(
      (user) => !alreadyAssignedIds.has(user._id.toString()),
    );

    if (newUsers.length === 0) {
      throw new BadRequestException('All users are already assigned to this assessment');
    }

    const newAssignments = newUsers.map((user) => ({
      userId: user._id,
      status: ASSESSMENT_ASSIGNMENT_STATUSES.ASSIGNED,
      assignedAt: new Date(),
    }));

    const updated = await this.assessmentModel
      .findByIdAndUpdate(
        assessmentId,
        { $push: { assignments: { $each: newAssignments } } },
        { new: true },
      )
      .lean()
      .exec();

    const assessmentTitle = assessment.name;

    for (const u of newUsers) {
      if (u.email) {
        void this.mailer.sendAssessmentAssigned({
          to: u.email,
          firstName: u.firstName,
          assessmentTitle,
          assessmentId: assessmentId.toString(),
        });
      }

      const pastorName = `${u.firstName} ${u.lastName}`;
      if (this.isPastoralLearnerRole(u.role as string | undefined) && u.assignedId?.length) {
        const seen = new Set<string>();
        for (const mentorRef of u.assignedId) {
          const mid = mentorRef.toString();
          if (seen.has(mid)) continue;
          seen.add(mid);
          const mentor = await this.userModel.findById(mentorRef).select('email firstName role').lean().exec();
          if (!mentor?.email || !this.isMentorTrackRole((mentor as { role?: string }).role)) continue;
          void this.mailer.sendAssessmentAssigned({
            to: mentor.email,
            firstName: mentor.firstName,
            assessmentTitle: `[Assigned to ${pastorName}] ${assessmentTitle}`,
            assessmentId: assessmentId.toString(),
          });
        }
      }
    }

    return updated;
  }

  // Get all assessments assigned to a specific user
  async getAssignedAssessments(userId: string) {

    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const userObjectId = new Types.ObjectId(userId);

    const assignments = await this.assessmentAssignedModel
      .find({ userId: userObjectId })
      .populate({
        path: 'assessmentId',
        select: 'name description bannerImage instructions sections'
      })
      .populate({
        path: 'answerId'
      })
      .populate({
        path: 'appointmentId',
        select: 'meetingDate endTime platform meetingLink status notes zoomMeeting zoomMeetingId userId mentorId',
        populate: [
          {
            path: 'userId',
            select: 'firstName lastName email phoneNumber profilePicture role roleId status',
          },
          {
            path: 'mentorId',
            select: 'firstName lastName email phoneNumber profilePicture role roleId status',
          },
        ],
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return assignments.map(a => ({
      assignmentId: a._id,

      assessment: a.assessmentId,

      dueDate: a.dueDate,
      status: a.status,

      startedAt: a.startedAt,
      submittedAt: a.submittedAt,

      answer: a.answerId,
      appointment: a.appointmentId
    }));

  }

  async saveOrUpdateSectionAnswers(
    assessmentId: string,
    userId: string,
    sectionId: string,
    layers: { layerId: string; selectedChoice: string }[],
  ) {
    if (!Types.ObjectId.isValid(assessmentId)) {
      throw new BadRequestException('Invalid assessment ID format');
    }
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }
    if (!Types.ObjectId.isValid(sectionId)) {
      throw new BadRequestException('Invalid section ID format');
    }

    const invalidLayerIds = layers.filter((layer) => !Types.ObjectId.isValid(layer.layerId));
    if (invalidLayerIds.length > 0) {
      throw new BadRequestException('Invalid layer IDs found');
    }

    const assessmentExists = await this.assessmentModel.exists({
      _id: assessmentId,
    });
    if (!assessmentExists) throw new NotFoundException('Assessment not found');

    const layerAnswers = layers.map((layer) => ({
      layerId: new Types.ObjectId(layer.layerId),
      selectedChoice: layer.selectedChoice,
      answeredAt: new Date(),
    }));

    const sectionScore = calculateSectionScore(layerAnswers);

    const updated = await this.userAnswerModel.findOneAndUpdate(
      {
        assessmentId: new Types.ObjectId(assessmentId),
        userId: new Types.ObjectId(userId),
        'sections.sectionId': new Types.ObjectId(sectionId),
      },
      {
        $set: {
          'sections.$.layers': layerAnswers,
          'sections.$.sectionScore': sectionScore,
        },
      },
      { new: true },
    )
      .lean()
      .exec();

    let result;
    if (updated) {
      result = updated;
    } else {
      result = await this.userAnswerModel.findOneAndUpdate(
        {
          assessmentId: new Types.ObjectId(assessmentId),
          userId: new Types.ObjectId(userId),
        },
        {
          $setOnInsert: {
            assessmentId: new Types.ObjectId(assessmentId),
            userId: new Types.ObjectId(userId),
          },
          $push: {
            sections: {
              sectionId: new Types.ObjectId(sectionId),
              layers: layerAnswers,
              sectionScore,
            },
          },
        },
        { upsert: true, new: true },
      )
        .lean()
        .exec();
    }

    if (result && result.sections && result.sections.length > 0) {
      const completedSectionsCount = result.sections.length;
      const assessmentIdObj = new Types.ObjectId(assessmentId);
      const userIdObj = new Types.ObjectId(userId);
      const userIdString = userIdObj.toString();

      const progressUpdateResult = await this.progressModel.findOneAndUpdate(
        {
          $or: [
            { userId: userIdObj },
            { userId: userIdString }
          ],
          'assessments.assessmentId': assessmentIdObj,
        },
        {
          $set: {
            'assessments.$.completedSections': completedSectionsCount,
          },
        },
        { new: true }
      ).exec();

      if (!progressUpdateResult) {
        console.warn(
          `Progress not found for userId: ${userId}, assessmentId: ${assessmentId}. ` +
          `Assessment should be assigned via assignAssessment() before saving answers.`
        );
      }
    }

    return result;
  }

  // Get all saved answers for a user
  async getUserAnswers(assessmentId: string, userId: string) {
    if (!Types.ObjectId.isValid(assessmentId)) {
      throw new BadRequestException('Invalid assessment ID format');
    }
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const result = await this.userAnswerModel
      .findOne({
        assessmentId: new Types.ObjectId(assessmentId),
        userId: new Types.ObjectId(userId),
      })
      .lean()
      .exec();

    if (!result)
      throw new NotFoundException(
        'No answers found for this user and assessment',
      );

    return result;
  }

  async submitPreSurvey(assessmentId: string, dto: SubmitPreSurveyDto) {
    const { userId, preSurveyAnswers } = dto;

    if (!Types.ObjectId.isValid(assessmentId)) {
      throw new BadRequestException('Invalid assessment ID format');
    }
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const assessment = await this.assessmentModel.findById(assessmentId).lean();
    if (!assessment) throw new NotFoundException('Assessment not found');

    if (assessment.type !== 'CMA') {
      throw new BadRequestException('PreSurvey is only applicable for CMA assessments');
    }

    if (!assessment.preSurvey || assessment.preSurvey.length === 0) {
      throw new BadRequestException('This assessment has no pre-survey questions');
    }

    const questionTexts = assessment.preSurvey.map(q => q.text);
    for (const answer of preSurveyAnswers) {
      if (!questionTexts.includes(answer.questionText)) {
        throw new BadRequestException(`Invalid question: ${answer.questionText}`);
      }
    }

    const updated = await this.userAnswerModel.findOneAndUpdate(
      {
        assessmentId: new Types.ObjectId(assessmentId),
        userId: new Types.ObjectId(userId),
      },
      {
        $set: {
          preSurveyAnswers,
          preSurveySubmittedAt: new Date(),
        },
      },
      { new: true, upsert: true }
    ).lean().exec();

    return updated;
  }

  // Get Pre-Survey Answers for a User
  async getPreSurveyAnswers(assessmentId: string, userId: string) {
    if (!Types.ObjectId.isValid(assessmentId)) {
      throw new BadRequestException('Invalid assessment ID format');
    }
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const assessment = await this.assessmentModel.findById(assessmentId).lean();
    if (!assessment) throw new NotFoundException('Assessment not found');

    if (assessment.type !== 'CMA') {
      throw new BadRequestException('PreSurvey is only applicable for CMA assessments');
    }

    const userAnswers = await this.userAnswerModel
      .findOne({
        assessmentId: new Types.ObjectId(assessmentId),
        userId: new Types.ObjectId(userId),
      })
      .lean()
      .exec();

    if (!userAnswers || !userAnswers.preSurveyAnswers?.length) {
      return {
        preSurveyAnswers: [],
        preSurveySubmittedAt: null,
        totalQuestions: assessment.preSurvey?.length || 0,
      };
    }

    return {
      preSurveyAnswers: userAnswers.preSurveyAnswers,
      preSurveySubmittedAt: userAnswers.preSurveySubmittedAt,
      totalQuestions: assessment.preSurvey?.length || 0,
    };
  }


  // Submit Section Answers
  async submitSectionAnswers(
    assessmentId: string,
    dto: SubmitSectionAnswersDto,
  ) {
    const { userId, answers } = dto;

    if (!Types.ObjectId.isValid(assessmentId)) {
      throw new BadRequestException('Invalid assessment ID format');
    }
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const assessment = await this.assessmentModel.findById(assessmentId).lean();
    if (!assessment) throw new NotFoundException('Assessment not found');

    const assessmentObjId = new Types.ObjectId(assessmentId);
    const userObjId = new Types.ObjectId(userId);

    // ensure base doc exists
    await this.userAnswerModel.updateOne(
      { assessmentId: assessmentObjId, userId: userObjId },
      {
        $setOnInsert: {
          assessmentId: assessmentObjId,
          userId: userObjId,
        },
      },
      { upsert: true },
    );

    // process each section safely
    for (const section of answers) {
      const layersMapped = section.layers.map((layer) => ({
        layerId: new Types.ObjectId(layer.layerId),
        selectedChoice: layer.selectedChoice,
        answeredAt: new Date(),
      }));

      const sectionScore = calculateSectionScore(layersMapped);

      const sectionObjId = new Types.ObjectId(section.sectionId);

      // try update existing section
      const updateResult = await this.userAnswerModel.updateOne(
        {
          assessmentId: assessmentObjId,
          userId: userObjId,
          'sections.sectionId': sectionObjId,
        },
        {
          $set: {
            'sections.$.layers': layersMapped,
            'sections.$.sectionScore': sectionScore,
          },
        },
      );

      // if section not present → push new
      if (updateResult.matchedCount === 0) {
        await this.userAnswerModel.updateOne(
          { assessmentId: assessmentObjId, userId: userObjId },
          {
            $push: {
              sections: {
                sectionId: sectionObjId,
                layers: layersMapped,
                sectionScore,
              },
            },
          },
        );
      }
    }

    // fetch final doc
    const updated = await this.userAnswerModel
      .findOne({
        assessmentId: assessmentObjId,
        userId: userObjId,
      })
      .lean();

    // progress update (your existing logic is fine)
    const completedSectionsCount = updated?.sections?.length || 0;
    const userIdString = userObjId.toString();

    await this.progressModel.findOneAndUpdate(
      {
        $or: [{ userId: userObjId }, { userId: userIdString }],
        'assessments.assessmentId': assessmentObjId,
      },
      {
        $set: {
          'assessments.$.completedSections': completedSectionsCount,
        },
      },
      { new: true },
    );

    return updated;
  }

  async updateBannerImage(
    assessmentId: string,
    file: Express.Multer.File,
  ): Promise<Assessment> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only JPEG, PNG, and WebP are allowed');
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds 5MB limit');
    }

    const assessment = await this.assessmentModel.findById(assessmentId);
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    const timestamp = Date.now();
    const fileExtension = file.originalname.split('.').pop();
    const sanitizedFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `assessment-banners/${assessmentId}/${timestamp}_${sanitizedFileName}`;

    const fileUrl = await this.s3Service.uploadFile(
      fileName,
      file.buffer,
      file.mimetype,
    );

    const updated = await this.assessmentModel
      .findByIdAndUpdate(
        assessmentId,
        { bannerImage: fileUrl },
        { new: true, runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Assessment not found');
    }
    return updated;
  }

  async updatePreSurvey(
    assessmentId: string,
    dto: { preSurvey: any[] },
  ): Promise<Assessment> {
    if (!Types.ObjectId.isValid(assessmentId)) {
      throw new BadRequestException('Invalid assessment ID format');
    }

    if (!dto.preSurvey || dto.preSurvey.length === 0) {
      throw new BadRequestException('Pre-survey questions cannot be empty');
    }

    const assessment = await this.assessmentModel.findById(assessmentId);
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    assessment.preSurvey = dto.preSurvey as any;

    await assessment.save();

    return assessment;
  }

  async getAssessmentRecommendations(
    assessmentId: string,
    userId: string,
  ): Promise<SectionRecommendationPreviewDto[]> {

    if (!Types.ObjectId.isValid(assessmentId))
      throw new BadRequestException('Invalid assessment ID');

    if (!Types.ObjectId.isValid(userId))
      throw new BadRequestException('Invalid user ID');

    const assessmentObjId = new Types.ObjectId(assessmentId);
    const userObjId = new Types.ObjectId(userId);

    const [assessment, userAnswers] = await Promise.all([
      this.assessmentModel
        .findById(assessmentObjId)
        .select('sections')
        .lean(),

      this.userAnswerModel
        .findOne({
          assessmentId: assessmentObjId,
          userId: userObjId,
        })
        .lean(),
    ]);

    if (!assessment)
      throw new NotFoundException('Assessment not found');

    if (!userAnswers)
      throw new NotFoundException('User answers not found');

    const result: SectionRecommendationPreviewDto[] = [];

    for (const sectionAnswer of userAnswers.sections ?? []) {

      const sectionConfig = assessment.sections.find(
        (s: any) => s._id.toString() === sectionAnswer.sectionId.toString()
      );

      if (!sectionConfig) continue;

      const levelRec = sectionConfig.recommendations?.find(
        (r: any) => r.level === sectionAnswer.sectionScore
      );

      result.push({
        sectionId: sectionAnswer.sectionId.toString(),
        sectionTitle: sectionConfig.title,
        score: sectionAnswer.sectionScore ?? 0,
        recommendations: levelRec?.items || [],
      });

    }

    return result;
  }

  async sendSectionRecommendation(
    assessmentId: string,
    userId: string,
    sectionId: string,
    recommendations: string[],
  ) {

    const updated = await this.userAnswerModel.findOneAndUpdate(
      {
        assessmentId: new Types.ObjectId(assessmentId),
        userId: new Types.ObjectId(userId),
        "sections.sectionId": new Types.ObjectId(sectionId),
        "sections.recommendations": { $size: 0 }
      },
      {
        $set: {
          "sections.$.recommendations": recommendations,
        },
      },
      { new: true }
    ).lean();

    if (!updated) {
      throw new BadRequestException(
        "Recommendation already sent or section not found"
      );
    }

    const assessmentLean = await this.assessmentModel
      .findById(assessmentId)
      .select('sections')
      .lean();
    let sectionTitle: string | undefined;
    const sid = sectionId.trim();
    if (assessmentLean?.sections?.length) {
      const match = assessmentLean.sections.find(
        (sec: { _id?: Types.ObjectId; title?: string }) =>
          sec._id && String(sec._id) === sid,
      );
      sectionTitle = match?.title;
    }
    const rec = assessmentSectionRecommendationNotification(sectionTitle);

    await this.notificationService.addNotification({
      userId,
      name: rec.name,
      details: rec.details,
      module: 'ASSESSMENT'
    });

    return updated;
  }


  async getAssessmentRecommendationRules(assessmentId: string) {

    if (!Types.ObjectId.isValid(assessmentId)) {
      throw new BadRequestException('Invalid assessment ID');
    }

    const assessment = await this.assessmentModel
      .findById(assessmentId)
      .select('sections')
      .lean();

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    return assessment.sections;
  }

}