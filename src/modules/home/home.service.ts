import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Home, HomeDocument } from './schemas/home.schema';
import { HomeResponseDto } from './dto/home-response.dto';
import { MentorResponseDto } from './dto/mentor-response.dto';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  toHomeResponseDto,
  toMentorMenteeDetailsDto,
} from './utils/home.mapper';
import { MentorMenteeDetailsDto } from './dto/mentor.mentee.response.dto';
import {
  Notification,
  NotificationDocument,
  NotificationItem,
} from './schemas/notification.schema';
import {
  AddNotificationDto,
  NotificationResponseDto,
} from './dto/notification.dto';
import { USER_ROLES } from '../../common/constants/status.constants';
import { Media, MediaDocument } from './schemas/media.schema';
import { S3Service } from '../s3/s3.service';
import { CreateMediaDto, UpdateMediaDto } from './dto/media.dto';
import { mapToResponse } from './utils/notification.mapper';
import { FirebaseService } from '../firebase/firebase.service';
import { ExpoNotificationService } from '../firebase/expo.service';

interface MentorFilterOptions {
  page?: number;
  limit?: number;
  country?: string;
  state?: string;
  conference?: string;
  role?: string;
  search?: string;
}

@Injectable()
export class HomeService {
  constructor(
    @InjectModel(Home.name)
    private readonly homeModel: Model<HomeDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(Media.name)
    private readonly mediaModel: Model<MediaDocument>,
    private readonly s3Service: S3Service,
    private readonly firebaseService: FirebaseService,
    private readonly expoService: ExpoNotificationService,
  ) { }

  async getByEmail(email: string): Promise<HomeResponseDto> {
    const home = await this.homeModel.findOne({ email }).lean().exec();

    if (!home) {
      throw new NotFoundException(`Home data not found for email: ${email}`);
    }
    return toHomeResponseDto(home as any);
  }

  async getMentorByEmail(email: string): Promise<MentorMenteeDetailsDto> {
    const user = await this.userModel
      .findOne({ email, role: USER_ROLES.MENTOR })
      .populate('interestId')
      .exec();

    if (!user) throw new NotFoundException('Mentor not found');

    return toMentorMenteeDetailsDto(user);
  }

  async getMenteeByEmail(email: string): Promise<MentorMenteeDetailsDto> {
    const user = await this.userModel
      .findOne({ email, role: USER_ROLES.PASTOR })
      .populate('interestId')
      .exec();

    if (!user) throw new NotFoundException('Mentee not found');

    return toMentorMenteeDetailsDto(user);
  }

  async getAllMentors(
    options: MentorFilterOptions = {},
  ): Promise<{ mentors: MentorResponseDto[]; total: number }> {

    const { page = 1, limit = 10, country, state, conference, role, search } = options;
    const skip = (page - 1) * limit;

    const roleFilter = role
      ? Array.isArray(role)
        ? { $in: role }
        : role
      : { $in: [USER_ROLES.MENTOR, "field mentor"] };

    const pipeline: any[] = [];

    pipeline.push({
      $match: { role: roleFilter },
    });

    pipeline.push({
      $lookup: {
        from: "interests",
        let: { userId: { $toString: "$_id" } },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$userId", "$$userId"] },
            },
          },
        ],
        as: "interestData",
      },
    });

    pipeline.push({
      $addFields: {
        phoneNumber: { $arrayElemAt: ["$interestData.phoneNumber", 0] },
        profileInfo: { $arrayElemAt: ["$interestData.profileInfo", 0] },
      },
    });

    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { firstName: { $regex: search, $options: "i" } },
            { lastName: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
            { username: { $regex: search, $options: "i" } },
            { phoneNumber: { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    if (country || state || conference) {
      const matchConditions: any = {};

      if (country) matchConditions["interestData.churchDetails.country"] = country;
      if (state) matchConditions["interestData.churchDetails.state"] = state;
      if (conference) matchConditions["interestData.conference"] = conference;

      pipeline.push({ $match: matchConditions });
    }

    pipeline.push({
      $project: {
        _id: 1,
        firstName: 1,
        lastName: 1,
        email: 1,
        username: 1,
        role: 1,
        roleId: 1,
        profilePicture: 1,
        phoneNumber: 1,
        profileInfo: 1,
      },
    });

    pipeline.push({
      $facet: {
        metadata: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limit }],
      },
    });

    const result = await this.userModel.aggregate(pipeline).exec();

    const total = result[0]?.metadata[0]?.total || 0;
    const mentorsData = result[0]?.data || [];

    const mentors: MentorResponseDto[] = mentorsData.map((mentor) => {
      const dto = new MentorResponseDto();
      dto.id = mentor._id.toString();
      dto.firstName = mentor.firstName;
      dto.lastName = mentor.lastName;
      dto.email = mentor.email;
      dto.username = mentor.username || "";
      dto.role = mentor.role;
      dto.roleId = mentor.roleId;
      dto.profileInfo = mentor.profileInfo || "";
      dto.phoneNumber = mentor.phoneNumber || "";
      return dto;
    });

    return { mentors, total };
  }

  async getAllMentees(
    options: {
      page?: number;
      limit?: number;
      phase?: string;
      country?: string;
      search?: string;
    } = {},
  ): Promise<{ mentees: MentorResponseDto[]; total: number }> {

    const { page = 1, limit = 10, phase, country, search } = options;
    const skip = (page - 1) * limit;

    const pipeline: any[] = [];

    pipeline.push({
      $match: { role: USER_ROLES.PASTOR },
    });

    pipeline.push({
      $lookup: {
        from: "interests",
        let: { userId: { $toString: "$_id" } },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$userId", "$$userId"] },
            },
          },
        ],
        as: "interestData",
      },
    });

    pipeline.push({
      $addFields: {
        phoneNumber: { $arrayElemAt: ["$interestData.phoneNumber", 0] },
        profileInfo: { $arrayElemAt: ["$interestData.profileInfo", 0] },
      },
    });

    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { firstName: { $regex: search, $options: "i" } },
            { lastName: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
            { username: { $regex: search, $options: "i" } },
            { phoneNumber: { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    if (country || phase) {
      const matchConditions: any = {};

      if (country) matchConditions["interestData.churchDetails.country"] = country;
      if (phase) matchConditions["interestData.churchDetails.state"] = phase;

      pipeline.push({ $match: matchConditions });
    }

    pipeline.push({
      $project: {
        _id: 1,
        firstName: 1,
        lastName: 1,
        email: 1,
        username: 1,
        role: 1,
        roleId: 1,
        profilePicture: 1,
        phoneNumber: 1,
        profileInfo: 1,
      },
    });

    pipeline.push({
      $facet: {
        metadata: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limit }],
      },
    });

    const result = await this.userModel.aggregate(pipeline).exec();

    const total = result[0]?.metadata[0]?.total || 0;
    const menteesData = result[0]?.data || [];

    const mentees: MentorResponseDto[] = menteesData.map((mentee) => {
      const dto = new MentorResponseDto();
      dto.id = mentee._id.toString();
      dto.firstName = mentee.firstName;
      dto.lastName = mentee.lastName;
      dto.email = mentee.email;
      dto.username = mentee.username || "";
      dto.role = mentee.role;
      dto.profileInfo = mentee.profileInfo || "";
      dto.phoneNumber = mentee.phoneNumber || "";
      return dto;
    });

    return { mentees, total };
  }

  async addNotification(dto: AddNotificationDto): Promise<NotificationResponseDto> {
    const { userId, role, name, details, module, referenceId } = dto;

    if (!userId && !role) {
      throw new BadRequestException("Either userId or role must be provided");
    }

    const newItem: NotificationItem = {
      name,
      details,
      module,
      referenceId,
      read: false,
    };

    let filter: any = {};

    if (userId) {
      filter = { userId };
    }

    else if (role) {
      filter = { role };
    }

    const notificationDoc = await this.notificationModel.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          userId: userId ?? null,
          role: role ?? null,
        },
        $push: { notifications: newItem }
      },
      { new: true, upsert: true }
    );

    // ================= PUSH NOTIFICATION =================
    try {
      let fcmTokens: string[] = [];
      let expoTokens: string[] = [];

      if (userId) {
        const user = await this.userModel
          .findById(userId)
          .select('fcmTokens expoTokens')
          .lean();

        fcmTokens = user?.fcmTokens ?? [];
        expoTokens = user?.expoTokens ?? [];
      }

      else if (role) {
        const users = await this.userModel
          .find({ role })
          .select('fcmTokens expoTokens')
          .lean();

        fcmTokens = users.flatMap(u => u.fcmTokens || []);
        expoTokens = users.flatMap(u => u.expoTokens || []);
      }

      // FCM
      if (fcmTokens.length) {
        const result = await this.firebaseService.sendPushNotification(
          fcmTokens,
          name,
          details,
          { module: module ?? '', referenceId: referenceId ?? '' },
        );

        const invalidTokens = result?.invalidTokens ?? [];

        if (invalidTokens.length) {
          await this.userModel.updateMany(
            { fcmTokens: { $in: invalidTokens } },
            { $pull: { fcmTokens: { $in: invalidTokens } } },
          );
        }
      }

      // Expo
      if (expoTokens.length) {
        const result = await this.expoService.sendPushNotification(
          expoTokens,
          name,
          details,
          { module: module ?? '', referenceId: referenceId ?? '' },
        );

        const invalidTokens = result?.invalidTokens ?? [];

        if (invalidTokens.length) {
          await this.userModel.updateMany(
            { expoTokens: { $in: invalidTokens } },
            { $pull: { expoTokens: { $in: invalidTokens } } },
          );
        }
      }
    } catch (err) {
      console.error('Push notification failed:', err);
    }

    return mapToResponse(notificationDoc);
  }

  async getNotifications(query: { userId?: string; role?: string }):
    Promise<NotificationResponseDto> {
    const { userId, role } = query;

    if (!userId && !role) {
      throw new BadRequestException("Either userId or role must be provided");
    }

    const filter: any = {};
    if (userId) filter.userId = userId;
    if (role) filter.role = role;

    const notificationDoc = await this.notificationModel.findOne(filter).lean();

    if (!notificationDoc) {
      throw new NotFoundException("No notifications found");
    }

    return mapToResponse(notificationDoc);
  }


  async deleteNotification(
    opts: { userId?: string; role?: string; notificationId: string }
  ): Promise<NotificationResponseDto> {

    const { userId, role, notificationId } = opts;

    if (!userId && !role) {
      throw new BadRequestException("Either userId or role must be provided");
    }

    const filter: any = {};
    if (userId) filter.userId = userId;
    if (role) filter.role = role;

    const doc = await this.notificationModel.findOne(filter);
    if (!doc) throw new NotFoundException("Notification document not found");

    const target = doc.notifications.find(
      (item: any) => item._id.toString() === notificationId
    );

    if (!target) throw new NotFoundException("Notification not found");

    target.read = true;
    await doc.save();

    return mapToResponse(doc);
  }

  async createMedia(dto: CreateMediaDto, files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one media file must be uploaded');
    }

    const mediaFiles: Media['mediaFiles'] = [];

    for (const file of files) {
      const mime = file.mimetype;

      const isImage = mime.startsWith('image/');
      const isVideo = mime.startsWith('video/');

      if (!isImage && !isVideo) {
        throw new BadRequestException('Only image or video files allowed');
      }

      if (isImage && file.size > 5 * 1024 * 1024) {
        throw new BadRequestException('Image exceeds 5MB limit');
      }
      if (isVideo && file.size > 50 * 1024 * 1024) {
        throw new BadRequestException('Video exceeds 50MB limit');
      }

      const ext = file.originalname.split('.').pop();
      const timestamp = Date.now();
      const key = `media/${isVideo ? 'video' : 'image'}/${timestamp}.${ext}`;

      const url = await this.s3Service.uploadFile(
        key,
        file.buffer,
        file.mimetype,
      );

      mediaFiles.push({
        url,
        type: isVideo ? 'video' : 'image',
        fileName: key,
        size: file.size,
        uploadedAt: new Date(),
      });
    }

    const saved = await this.mediaModel.create({
      heading: dto.heading,
      subheading: dto.subheading,
      description: dto.description,
      mediaFiles,
    });

    return saved;
  }

  async findAllMedia() {
    return await this.mediaModel.find().sort({ createdAt: -1 }).lean();
  }

  async findOneMedia(id: string) {
    const media = await this.mediaModel.findById(id).lean();
    if (!media) throw new NotFoundException('Media not found');
    return media;
  }


  async updateMedia(id: string, dto: UpdateMediaDto, files?: Express.Multer.File[]) {
    const media = await this.mediaModel.findById(id);
    if (!media) throw new NotFoundException('Media not found');

    const updatedFiles = [...media.mediaFiles];

    if (files && files.length > 0) {
      for (const file of files) {
        const mime = file.mimetype;
        const isImage = mime.startsWith('image/');
        const isVideo = mime.startsWith('video/');

        if (!isImage && !isVideo) {
          throw new BadRequestException('Only image or video allowed');
        }

        const ext = file.originalname.split('.').pop();
        const timestamp = Date.now();
        const key = `media/${isVideo ? 'video' : 'image'}/${id}_${timestamp}.${ext}`;

        const url = await this.s3Service.uploadFile(
          key,
          file.buffer,
          file.mimetype,
        );

        updatedFiles.push({
          url,
          type: isVideo ? 'video' : 'image',
          fileName: key,
        });
      }
    }

    const updated = await this.mediaModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            heading: dto.heading ?? media.heading,
            subheading: dto.subheading ?? media.subheading,
            description: dto.description ?? media.description,
            mediaFiles: updatedFiles,
          },
        },
        { new: true },
      )
      .lean();

    return updated;
  }

  async deleteMedia(id: string) {
    const deleted = await this.mediaModel.findByIdAndDelete(id).lean();
    if (!deleted) throw new NotFoundException('Media not found');
    return deleted;
  }

  async saveDeviceToken(userId: string, token: string) {
    const isExpo = token.startsWith('ExponentPushToken');

    if (isExpo) {
      await this.userModel.updateOne(
        { _id: userId },
        { $addToSet: { expoTokens: token } },
      );
    } else {
      await this.userModel.updateOne(
        { _id: userId },
        { $addToSet: { fcmTokens: token } },
      );
    }
  }
}