import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Interest, InterestDocument } from './schemas/interest.schema';
import {
  CreateInterestDto,
  UpdateInterestDto,
} from './dto/create-interest.dto';
import { InterestResponseDto } from './dto/interest-response.dto';
import { toInterestResponseDto } from './utils/interest.mapper';
import { UserResponseDto } from '../users/dto/user-response.dto';
import {
  COUNTRIES_STATES_LIST,
  INTERESTS_LIST,
  TITLES_LIST,
} from 'src/shared/constants/metadata.constants';
import { InterestMetadataDto } from './dto/interestMetadata.dto';
import { VALID_USER_APPLICATION_STATUSES, USER_APPLICATION_STATUSES, VALID_USER_STATUSES, USER_STATUSES } from '../../common/constants/status.constants';
import { UsersService } from '../users/users.service';
import { ROLES } from '../../common/constants/roles.constants';
import { HomeService } from '../home/home.service';

@Injectable()
export class InterestService {
  constructor(
    @InjectModel(Interest.name)
    private readonly interestModel: Model<InterestDocument>,
    private readonly usersService: UsersService,
    private readonly notificationService: HomeService,
  ) { }

  private mapTitleToRole(title?: string): string {
    if (!title) return ROLES.PENDING;

    const normalizedTitle = title.toLowerCase().trim().replace(/\.$/, ''); // Remove trailing dot

    const titleRoleMap: Record<string, string> = {
      'pastor': ROLES.PASTOR,
      'lay leader': ROLES.LAY_LEADER,
      'seminarian': ROLES.SEMINARIAN,
      'mentor': ROLES.MENTOR,
      'field mentor': ROLES.FIELD_MENTOR,
      'director': ROLES.DIRECTOR,
    };

    return titleRoleMap[normalizedTitle] || ROLES.PENDING;
  }

  async create(dto: CreateInterestDto): Promise<InterestResponseDto> {
    const existingInterest = await this.interestModel.findOne({ email: dto.email }).exec();

    if (existingInterest) {
      console.log(`Interest form already exists for email: ${dto.email}, rejecting duplicate submission`);
      throw new BadRequestException('An interest form with this email already exists. Please use a different email or contact support.');
    }

    const interestStatus = dto.createdBy === 'admin'
      ? USER_APPLICATION_STATUSES.ACCEPTED
      : (dto.status || USER_APPLICATION_STATUSES.NEW);

    const userStatus = interestStatus === USER_APPLICATION_STATUSES.NEW
      ? USER_STATUSES.PENDING
      : interestStatus;

    const interestData = {
      ...dto,
      status: interestStatus,
      createdBy: dto.createdBy || 'self',
    };

    let interest = await this.interestModel.create(interestData);
    console.log(`Interest form created successfully for email: ${dto.email}, interestId: ${interest._id}, createdBy: ${interest.createdBy}`);

    const assignedRole = this.mapTitleToRole(dto.title);

    try {
      const newUser = await this.usersService.create({
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        interestId: interest._id,
        profilePicture: dto.profilePicture,
        status: userStatus,
        role: assignedRole,
        isEmailVerified: dto.createdBy === 'admin',
      });

      const updatedInterest = await this.interestModel.findByIdAndUpdate(
        interest._id,
        { userId: newUser.id },
        { new: true }
      ).exec();

      if (updatedInterest) {
        interest = updatedInterest;
      }

      console.log(`User ${newUser.id} created with role "${assignedRole}" (based on title: "${dto.title}") and linked to interest ${interest._id}`);
    } catch (userError: any) {
      console.error(`Failed to create user for interest ${interest._id}:`, userError.message);

      if (userError.code === 11000) {
        console.error(`CRITICAL: User with email ${dto.email} already exists but no interest form was found. This indicates a data consistency issue.`);
      }
    }

    try {
      await this.notificationService.addNotification({
        role: ROLES.DIRECTOR,
        name: "New Interest Form Submitted",
        details: `${dto.firstName} ${dto.lastName} submitted a new interest form.`,
        module: "interest"
      });
    } catch (notificationError: any) {
      console.warn(`Failed to send notification for interest ${interest._id}:`, notificationError.message);
    }

    return toInterestResponseDto(interest);
  }

  async findAll(filters?: { search?: string; status?: string }) {
    const pipeline: any[] = [
      {
        $lookup: {
          from: 'users',
          localField: 'email',
          foreignField: 'email',
          as: 'user',
        },
      },
      {
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: true,
        },
      },
    ];

    const match: any = {};

    if (filters?.search) {
      const regex = new RegExp(filters.search, 'i');
      match.$or = [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
        { phoneNumber: regex },
        { 'user.email': regex },
      ];
    }

    if (filters?.status) {
      match.status = filters.status;
    }

    // Add filters to pipeline if they exist
    if (Object.keys(match).length > 0) {
      pipeline.push({ $match: match });
    }

    // Sort by newest
    pipeline.push({ $sort: { createdAt: -1 } });

    // Project Interest fields with necessary user info
    pipeline.push({
      $project: {
        _id: 1,
        firstName: 1,
        lastName: 1,
        email: 1,
        phoneNumber: 1,
        churchDetails: 1,
        title: 1,
        conference: 1,
        yearsInMinistry: 1,
        currentCommunityProjects: 1,
        interests: 1,
        comments: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1,
        'user._id': 1,
        'user.role': 1,
        'user.roleId': 1,
        'user.isEmailVerified': 1,
      },
    });

    const results = await this.interestModel.aggregate(pipeline).exec();
    return results;
  }

  async getMetadata(): Promise<InterestMetadataDto> {
    const countriesList = COUNTRIES_STATES_LIST.map((item) => item.country);
    return {
      titles: TITLES_LIST,
      countries: countriesList,
      countryStates: COUNTRIES_STATES_LIST,
      interests: INTERESTS_LIST,
    };
  }

  async findByEmail(email: string): Promise<InterestResponseDto> {
    const interest = await this.interestModel.findOne({ email }).lean().exec();
    if (!interest) throw new NotFoundException('Interest form not found');
    return toInterestResponseDto(interest);
  }

  async update(
    email: string,
    dto: UpdateInterestDto,
  ): Promise<InterestResponseDto> {
    const updatedInterest = await this.interestModel
      .findOneAndUpdate(
        { email },
        { $set: dto },
        { new: true, runValidators: true },
      )
      .exec();

    if (!updatedInterest) throw new NotFoundException('Interest form not found');
    return toInterestResponseDto(updatedInterest);
  }

  async getInterestsByStatus(status: string, limit?: number) {
    if (!VALID_USER_APPLICATION_STATUSES.includes(status as any)) {
      throw new BadRequestException('Invalid status value');
    }

    const pipeline: any[] = [
      { $match: { status: status } },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: 'interestId',
          as: 'userDetails',
        },
      },
      { $unwind: { path: '$userDetails', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          firstName: 1,
          lastName: 1,
          email: 1,
          phoneNumber: 1,
          profilePicture: 1,
          profileInfo: 1,
          title: 1,
          status: 1,
          createdAt: 1,
          updatedAt: 1,
          churchDetails: 1,
          interests: 1,
          'userDetails._id': 1,
          'userDetails.role': 1,
          'userDetails.roleId': 1,
          'userDetails.profilePicture': 1,
          'userDetails.isEmailVerified': 1,
          'userDetails.status': 1,
        },
      },
      { $sort: { createdAt: -1 } },
    ];

    if (limit && limit > 0) {
      const safeLimit = Math.min(limit, 100);
      pipeline.push({ $limit: safeLimit });
    }

    return this.interestModel.aggregate(pipeline).exec();
  }

  async updateUserStatus(userId: string, status: string): Promise<UserResponseDto> {
    if (!VALID_USER_STATUSES.includes(status as any)) {
      throw new BadRequestException('Invalid status value. Allowed values: pending, accepted, rejected');
    }

    const updatedUser = await this.usersService.update(userId, { status });
    console.log(`Updated user ${userId} with status: ${status}`);

    this.interestModel.updateOne(
      { userId: userId },
      { $set: { status } },
      { runValidators: true }
    ).exec()
      .then(() => console.log(`Updated interest form status for user ${userId}`))
      .catch((error) => console.warn(`Failed to update interest status for user ${userId}:`, error.message));

    this.notificationService.addNotification({
      userId: userId,
      name: "STATUS_UPDATED",
      details: `Your application status was changed to: ${status}`,
      module: "user-status",
    })
      .then(() => console.log(`Notification sent to user ${userId}`))
      .catch((err) => console.warn(`Failed to send notification to user ${userId}:`, err.message));

    return updatedUser;
  }

  async findById(id: string): Promise<InterestResponseDto> {
    const interest = await this.interestModel.findById(id).lean().exec();
    if (!interest) throw new NotFoundException('Interest form not found');
    return toInterestResponseDto(interest);
  }
}
