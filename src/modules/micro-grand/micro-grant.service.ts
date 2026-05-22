import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  MicroGrantForm,
  MicroGrantFormDocument,
} from './schemas/micro-grant-form.schema';
import {
  MicroGrantApplication,
  MicroGrantApplicationDocument,
} from './schemas/micro-grant-application.schema';
import {
  ApplyMicroGrantDto,
  CreateOrUpdateFormDto,
} from './dto/micro-grant.dto';
import { User, UserDocument } from '../users/schemas/user.schema';
import { S3Service } from '../s3/s3.service';
import { HomeService } from '../home/home.service';
import { MailerService } from 'src/common/utils/mail.util';
import { ConfigService } from '@nestjs/config';
import { ROLES } from 'src/common/constants/roles.constants';
import { USER_APPLICATION_STATUSES } from 'src/common/constants/status.constants';
import { microGrantStatusNotification } from 'src/common/utils/notification-copy.util';
export class MicroGrantService {
  constructor(
    @InjectModel(MicroGrantForm.name)
    private formModel: Model<MicroGrantFormDocument>,
    @InjectModel(MicroGrantApplication.name)
    private applicationModel: Model<MicroGrantApplicationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly s3Service: S3Service,
    private readonly notificationService: HomeService,
    private readonly mailer: MailerService,
    private readonly configService: ConfigService,
  ) { }

  async createOrUpdateForm(dto: CreateOrUpdateFormDto) {
    const existingForm = await this.formModel
      .findOne()
      .sort({ updatedAt: -1 })
      .exec();

    const payload = {
      title: dto.title,
      description: dto.description ?? '',
      sections: dto.sections.map((section) => ({
        section_title: section.section_title,
        section_intro: section.section_intro ?? '',
        reportingProcedure: section.reportingProcedure ?? '',
        fields: section.fields.map((field) => ({
          label: field.label,
          type: field.type,
          description: field.description ?? '',
          placeholder: field.placeholder ?? '',
          required: field.required ?? false,
          options: field.options ?? [],
        })),
      })),
    };

    if (existingForm) {
      return this.formModel
        .findByIdAndUpdate(existingForm._id, payload, { new: true })
        .exec();
    }

    return this.formModel.create(payload);
  }


  async getForm() {
    const form = await this.formModel
      .findOne()
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    if (!form) throw new NotFoundException('No active form found');
    return form;
  }

  async applyForGrant(dto: ApplyMicroGrantDto, files: Express.Multer.File[]) {

    let answers = dto.answers;

    if (typeof answers === 'string') {
      try {
        answers = JSON.parse(answers);
      } catch (err) {
        throw new BadRequestException('answers must be valid JSON');
      }
    }

    const form = await this.formModel
      .findOne()
      .sort({ updatedAt: -1 })
      .lean()
      .exec();

    if (!form) {
      throw new NotFoundException('No active form available');
    }

    const existing = await this.applicationModel.findOne({
      userId: new Types.ObjectId(dto.userId),
      formId: form._id,
    });

    if (existing) {
      throw new BadRequestException('You have already applied for this grant.');
    }

    const requiredFields = form.sections
      .flatMap(section => section.fields)
      .filter(field => field.required);

    const missingRequired = requiredFields.filter(
      field =>
        !answers[field.label] ||
        (typeof answers[field.label] === 'string' &&
          answers[field.label].trim() === '')
    );

    if (missingRequired.length > 0) {
      throw new BadRequestException(
        `Missing answers for required fields: ${missingRequired
          .map(f => f.label)
          .join(', ')}`
      );
    }


    if (missingRequired.length > 0) {
      throw new BadRequestException(
        `Missing answers for required fields: ${missingRequired
          .map(f => f.label)
          .join(', ')}`
      );
    }

    const uploadedDocs: string[] = [];

    if (files && files.length > 0) {
      for (const file of files) {
        const url = await this.s3Service.uploadFile(
          file.originalname,
          file.buffer,
          file.mimetype
        );

        uploadedDocs.push(url);
      }
    }

    const application = await this.applicationModel.create({
      userId: new Types.ObjectId(dto.userId),
      formId: form._id,
      answers: answers,
      supportingDocs: uploadedDocs,
    });

    await this.notificationService.addNotification({
      userId: dto.userId,
      name: 'Micro-grant submitted',
      details:
        'Your micro-grant application was sent to the CCC team. You will get another alert when a director reviews it.',
      module: 'microgrant'
    });

    const applicant = await this.userModel.findById(dto.userId).select('firstName lastName email role').lean();

    if (applicant && (applicant as { email?: string }).email) {
      void this.mailer.sendMicroGrantApplicantReceived({
        to: (applicant as { email: string }).email,
        firstName: (applicant as { firstName?: string }).firstName || 'there',
        statusUrl:
          this.mailer.microGrantApplicantPortalUrl((application._id as Types.ObjectId).toString()) || undefined,
      });
    }

    const directors = await this.userModel
      .find({ role: ROLES.DIRECTOR })
      .select('_id email firstName')
      .lean()
      .exec();
    const submittedAtIso = new Date(
      (application as unknown as { createdAt?: Date }).createdAt?.getTime?.() ?? Date.now(),
    ).toUTCString();

    const applicantRole = (
      applicant as { role?: string } | undefined | null)?.role || 'participant';
    const applicantName = applicant ?
      `${(applicant as any).firstName || ''} ${(applicant as any).lastName || ''}`.trim()
    : dto.userId;
    const web = (this.configService.get<string>('CCC_PUBLIC_WEB_URL') || '').trim().replace(/\/$/, '');
    const reviewUrl =
      (
        web ?
          `${web}/${this.configService.get<string>('CCC_DIRECTOR_MICROGRANT_PATH')?.trim().replace(/^\/+/, '').replace(/\/$/, '') || 'dashboard/micro-grants'}`
        : ''

      ).trim();

    for (const director of directors) {
      const did = (director as { _id: Types.ObjectId })._id?.toString();
      const de = (director as { email?: string }).email;
      if (!did) continue;
      if (de) {
        void this.mailer.sendMicroGrantDirectorNew({
          to: de,
          directorFirstName: (director as { firstName?: string }).firstName || 'there',
          applicantName: applicantName || 'Applicant',
          applicantRole: applicantRole as string,
          submittedAtIso,
          reviewUrl: reviewUrl || undefined,
        });
      }
      await this.notificationService.addNotification({
        userId: did,
        name: 'Micro-grant ready to review',
        details: `${applicantName || 'A participant'} submitted a micro-grant application. Open CCC to review and update the status.`,
        module: 'microgrant'
      });
    }

    return application;
  }


  async getApplications(status?: string, search?: string) {
    const query: any = {};

    if (status) query.status = status;

    if (search) {
      query['$or'] = [
        { 'answers.Church Name': new RegExp(search, 'i') },
        { 'answers.Purpose of Grant': new RegExp(search, 'i') },
      ];
    }

    const applications = await this.applicationModel
      .find(query)
      .populate('userId', 'name email')
      .populate('formId', 'title')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return applications;
  }

  async getUserApplication(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID format');
    }

    const user = await this.userModel
      .findById(userId)
      .select('name email role profileImage')
      .lean()
      .exec();

    const query = { userId: new Types.ObjectId(userId) };

    const application = await this.applicationModel
      .findOne(query)
      .populate('formId', 'title description')
      .lean()
      .exec();

    if (!application)
      throw new NotFoundException('Application not found for this user');

    return { user, application };
  }

  async updateApplicationStatus(id: string, status: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid application ID');
    }

    const application = await this.applicationModel
      .findByIdAndUpdate(id, { status }, { new: true })
      .exec();

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    const mg = microGrantStatusNotification(status);

    await this.notificationService.addNotification({
      userId: application.userId.toString(),
      name: mg.name,
      details: mg.details,
      module: 'microgrant'
    });

    const applicant = await this.userModel
      .findById(application.userId)
      .select('email firstName')
      .lean();

    const st = typeof status === 'string' ? status.trim().toLowerCase() : '';
    const ae = applicant as { email?: string; firstName?: string } | null;
    if (ae?.email) {
      if (st === USER_APPLICATION_STATUSES.REJECTED.toLowerCase()) {
        void this.mailer.sendMicroGrantRejected({
          to: ae.email,
          firstName: ae.firstName || 'there',
          detailUrl:
            this.mailer.microGrantApplicantPortalUrl((application._id as Types.ObjectId).toString()) || undefined,
        });
      }
      if (st === USER_APPLICATION_STATUSES.PENDING.toLowerCase()) {
        void this.mailer.sendMicroGrantPending({
          to: ae.email,
          firstName: ae.firstName || 'there',
          statusUrl:
            this.mailer.microGrantApplicantPortalUrl((application._id as Types.ObjectId).toString()) ||
            undefined,
        });
      }
    }

    return {
      message: `Application status updated to ${status}`,
      application,
    };
  }

  async checkApplication(userId: string) {
    const application = await this.applicationModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean();

    if (!application) {
      return {
        applied: false,
        status: "not_applied"
      };
    }

    return {
      applied: true,
      status: application.status,
      applicationId: application._id,
    };
  }
}
