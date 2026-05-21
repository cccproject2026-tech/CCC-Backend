import {
    Injectable,
    BadRequestException,
    NotFoundException,
    ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { Interest, InterestDocument } from '../interests/schemas/interest.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { hashPassword } from '../../common/utils/bcrypt.util';
import { toUserResponseDto } from './utils/user.mapper';
import { AssignMentorMenteeDto, RemoveMentorMenteeDto, UserResponseDto } from './dto/user-response.dto';
import { S3Service } from '../s3/s3.service';
import { UserDocumentResponseDto } from './dto/upload-document.dto';
import { CreateNoteDto, NoteResponseDto, UpdateNoteDto } from './dto/notes.dto';
import {
    InviteFieldMentorDto,
    AcceptInvitationDto,
    MarkCompletedDto,
    IssueCertificateDto,
} from './dto/user-operations.dto';
import { ROLES } from '../../common/constants/roles.constants';
import { nanoid } from 'nanoid';
import { HomeService } from '../home/home.service';
import { MailerService } from '../../common/utils/mail.util';
import { ConfigService } from '@nestjs/config';

/** Mongoose assigns `_id` on each `uploadedDocuments` subdocument; it is not on the User class fields type. */
type UploadedDocumentSubdoc = User['uploadedDocuments'][number] & {
    _id: Types.ObjectId;
};

@Injectable()
export class UsersService {
    constructor(
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        @InjectModel(Interest.name) private interestModel: Model<InterestDocument>,
        private readonly s3Service: S3Service,
        private readonly notificationService: HomeService,
        private readonly mailer: MailerService,
        private readonly config: ConfigService,
    ) { }

    /** Human-readable label for assignment emails ("mentor", "pastor", or generic). */
    private connectionRoleLabel(counterpartRole: string): string {
        const r = (counterpartRole || '').trim().toLowerCase();
        if (r === ROLES.MENTOR || r === ROLES.FIELD_MENTOR) return 'mentor';
        if (r === ROLES.PASTOR || r === ROLES.LAY_LEADER || r === ROLES.SEMINARIAN) return 'pastor';
        return 'CCC partner';
    }

    private fieldMentorInviteLink(token: string): string {
        const tpl = this.config.get<string>('CCC_FIELD_MENTOR_INVITE_URL_TEMPLATE')?.trim();
        const encToken = encodeURIComponent(token);
        if (tpl?.includes('{token}')) {
            return tpl.replace(/{token}/g, encToken);
        }
        const web = (this.config.get<string>('CCC_PUBLIC_WEB_URL') || '').trim().replace(/\/$/, '');
        if (!web) return '';
        const pathSeg =
            this.config.get<string>('CCC_FIELD_MENTOR_INVITE_PATH')?.trim()?.replace(/^\/+/, '').replace(/\/$/, '') ||
            'accept-field-mentor';
        return `${web}/${pathSeg}?token=${encodeURIComponent(token)}`;
    }

    async create(dto: CreateUserDto): Promise<UserResponseDto> {
        const existing = await this.userModel.findOne({ email: dto.email });
        if (existing) throw new BadRequestException('Email already registered');

        const hashedPassword = dto.password
            ? await hashPassword(dto.password)
            : undefined;

        const user = new this.userModel({
            ...dto,
            password: hashedPassword,
        });

        const savedUser = await user.save();
        return toUserResponseDto(savedUser);
    }

    async findAll(filters?: {
        role?: string;
        status?: string;
        hasCompleted?: boolean;
        page?: number;
        limit?: number;
        search?: string;
        roleMatch?: 'exact' | 'mixed';
    }): Promise<{ users: UserResponseDto[]; total: number; page: number; totalPages: number }> {

        const query: any = {};

        if (filters?.role) {
            const roleMatch = filters.roleMatch ?? 'exact';

            if (roleMatch === 'exact') {
                query.role = filters.role;
            } else if (roleMatch === 'mixed') {
                if (filters.role === 'mentor' || filters.role === 'field mentor') {
                    query.role = { $in: ['mentor', 'field mentor'] };
                } else if (filters.role === 'pastor' || filters.role === 'lay leader' || filters.role === 'seminarian') {
                    query.role = { $in: ['pastor', 'lay leader', 'seminarian'] };
                } else {
                    query.role = filters.role;
                }
            } else {
                query.role = filters.role;
            }
        }

        if (filters?.status) {
            query.status = filters.status;
        }

        if (filters?.hasCompleted !== undefined) {
            query.hasCompleted = filters.hasCompleted;
        }

        if (filters?.search) {
            query.$or = [
                { firstName: { $regex: filters.search, $options: 'i' } },
                { lastName: { $regex: filters.search, $options: 'i' } },
                { email: { $regex: filters.search, $options: 'i' } },
                { username: { $regex: filters.search, $options: 'i' } },
            ];
        }

        const page = filters?.page && filters.page > 0 ? filters.page : 1;
        const limit = filters?.limit && filters.limit > 0 ? filters.limit : 10;
        const skip = (page - 1) * limit;

        const [usersRaw, total] = await Promise.all([
            this.userModel
                .find(query)
                .select('-password -refreshToken -uploadedDocuments -notes')
                .populate({
                    path: 'interestId',
                    select: 'profileInfo phoneNumber',
                })
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 })
                .lean()
                .exec(),

            this.userModel.countDocuments(query).exec(),
        ]);

        const users = usersRaw.map((user: any) => {
            const dto = toUserResponseDto(user);
            return {
                ...dto,
                profileInfo: user.interestId?.profileInfo ?? null,
                phoneNumber: user.interestId?.phoneNumber ?? null,
            };
        });

        return {
            users,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        };
    }

    async findById(id: string): Promise<any> {
        const user = await this.userModel
            .findById(id)
            .select('-password -refreshToken -uploadedDocuments')
            .lean();

        if (!user) throw new NotFoundException('User not found');

        const interest = await this.interestModel
            .findOne({ userId: id })
            .lean();

        return {
            ...toUserResponseDto(user),
            interest: interest || null,
        };
    }

    async findByEmail(email: string): Promise<UserDocument> {
        const user = await this.userModel.findOne({ email }).exec();
        if (!user) throw new NotFoundException('User not found');
        return user;
    }

    async findByEmailOptional(email: string | RegExp): Promise<UserDocument | null> {
        return this.userModel.findOne({ email }).exec();
    }

    async findByRole(role: string): Promise<UserResponseDto[]> {
        const users = await this.userModel.find({ role }).select('-password -refreshToken -uploadedDocuments -notes').lean().exec();
        if (!users || users.length === 0)
            throw new NotFoundException('User not found');
        return users.map((user) => toUserResponseDto(user));
    }

    async update(
        id: string,
        updateData: UpdateUserDto,
    ): Promise<UserResponseDto> {
        const dataToUpdate: any = { ...updateData };
        if (updateData.password) {
            dataToUpdate.password = await hashPassword(updateData.password);
        }

        const updated = await this.userModel
            .findByIdAndUpdate(id, dataToUpdate, { new: true, runValidators: true })
            .select('-password -refreshToken -uploadedDocuments')
            .exec();
        if (!updated) throw new NotFoundException('User not found');

        return toUserResponseDto(updated);
    }

    async delete(id: string): Promise<void> {
        const result = await this.userModel.findByIdAndDelete(id).exec();
        if (!result) throw new NotFoundException('User not found');
    }

    async saveRefreshToken(userId: string, token: string): Promise<void> {
        await this.userModel.findByIdAndUpdate(userId, { refreshToken: token });
    }

    async clearRefreshToken(userId: string): Promise<void> {
        await this.userModel.findByIdAndUpdate(userId, { refreshToken: null });
    }

    async checkUserStatus(userId: string): Promise<string> {
        const user = await this.userModel.findById(userId).select('status').lean().exec();
        if (!user) {
            throw new NotFoundException('User not found');
        }
        return user.status;
    }

    async assignUsers(userId: string, dto: AssignMentorMenteeDto) {
        const assigningUser = await this.userModel.findById(userId)
            .select('_id firstName lastName email role')
            .lean();

        if (!assigningUser) throw new NotFoundException('User not found');

        const targetUsers = await this.userModel.find({
            _id: { $in: dto.assignedId }
        }).select('_id firstName lastName email role').lean();

        if (targetUsers.length !== dto.assignedId.length) {
            throw new NotFoundException('One or more users not found');
        }

        const targetIds = targetUsers.map(u => u._id);

        await this.userModel.findByIdAndUpdate(
            userId,
            { $addToSet: { assignedId: { $each: targetIds } } },
            { new: true }
        );

        await this.userModel.updateMany(
            { _id: { $in: targetIds } },
            { $addToSet: { assignedId: assigningUser._id } }
        );

        const assignerName = `${assigningUser.firstName} ${assigningUser.lastName}`;
        const assignerLabel = assigningUser.role ?? '';
        const assignerIdStr = assigningUser._id.toString();

        for (const target of targetUsers) {
            await this.notificationService.addNotification({
                userId: target._id.toString(),
                name: "Assigned",
                details: `You have been assigned to ${assigningUser.firstName} ${assigningUser.lastName}.`,
                module: "assignment",
            });

            const targetEmail = (target as { email?: string }).email;
            if (targetEmail) {
                void this.mailer.sendPartnerAssignedWithProfile({
                    to: targetEmail,
                    recipientFirstName: target.firstName,
                    counterpartName: assignerName,
                    counterpartUserId: assignerIdStr,
                    counterpartRoleLabel: this.connectionRoleLabel(assignerLabel),
                });
            }
            const assignerEmail = (assigningUser as { email?: string }).email;
            if (assignerEmail) {
                void this.mailer.sendPartnerAssignedWithProfile({
                    to: assignerEmail,
                    recipientFirstName: assigningUser.firstName,
                    counterpartName: `${target.firstName} ${target.lastName}`,
                    counterpartUserId: target._id.toString(),
                    counterpartRoleLabel: this.connectionRoleLabel((target as { role?: string }).role ?? ''),
                });
            }
        }

        await this.notificationService.addNotification({
            userId,
            name: "Assigned",
            details: `You have been assigned to ${assigningUser.firstName} ${assigningUser.lastName}.`,
            module: "assignment",
        });

        return this.userModel.findById(userId).populate('assignedId');
    }

    async removeUsers(userId: string, dto: RemoveMentorMenteeDto) {
        const user = await this.userModel.findById(userId);
        if (!user) throw new NotFoundException('User not found');

        const targetUsers = await this.userModel.find({
            _id: { $in: dto.assignedId }
        }).select('_id').lean();

        if (targetUsers.length !== dto.assignedId.length) {
            throw new NotFoundException('One or more users not found');
        }

        const targetIds = targetUsers.map(u => u._id);

        await this.userModel.findByIdAndUpdate(
            userId,
            { $pull: { assignedId: { $in: targetIds } } },
            { new: true }
        );

        await this.userModel.updateMany(
            { _id: { $in: targetIds } },
            { $pull: { assignedId: user._id } }
        );

        return this.userModel.findById(userId).populate('assignedId');
    }

    async getAssignedUsers(userId: string) {
        const user = await this.userModel
            .findById(userId)
            .select("assignedId")
            .lean();

        if (!user) throw new NotFoundException("User not found");

        const assignedIds = (user.assignedId || []).map((id) => id.toString());

        if (assignedIds.length === 0) return [];

        const assignedUsers = await this.userModel.aggregate([
            {
                $match: {
                    _id: { $in: assignedIds.map((id) => new Types.ObjectId(id)) },
                },
            },

            {
                $lookup: {
                    from: "interests",
                    let: { userId: { $toString: "$_id" } },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$userId", "$$userId"] }
                            }
                        }
                    ],
                    as: "interestData"
                }
            },

            {
                $addFields: {
                    phoneNumber: { $arrayElemAt: ["$interestData.phoneNumber", 0] },
                    profileInfo: { $arrayElemAt: ["$interestData.profileInfo", 0] },
                }
            },

            {
                $project: {
                    _id: 1,
                    firstName: 1,
                    lastName: 1,
                    email: 1,
                    role: 1,
                    status: 1,
                    profilePicture: 1,
                    phoneNumber: 1,
                    profileInfo: 1,
                },
            },
        ]);

        return assignedUsers;
    }


    async updateProfilePicture(
        userId: string,
        file: Express.Multer.File,
    ): Promise<UserResponseDto> {
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

        const user = await this.userModel.findById(userId);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const timestamp = Date.now();
        const fileExtension = file.originalname.split('.').pop();
        const fileName = `profile-pictures/${userId}_${timestamp}.${fileExtension}`;

        const fileUrl = await this.s3Service.uploadFile(
            fileName,
            file.buffer,
            file.mimetype,
        );

        const updated = await this.userModel
            .findByIdAndUpdate(
                userId,
                { profilePicture: fileUrl },
                { new: true, runValidators: true }
            )
            .select('-password -refreshToken -uploadedDocuments -notes')
            .exec();

        if (!updated) {
            throw new NotFoundException('User not found');
        }

        return toUserResponseDto(updated);
    }

    async uploadDocument(
        userId: string,
        file: Express.Multer.File,
    ): Promise<UserDocumentResponseDto> {
        if (!file) {
            throw new BadRequestException('No file provided');
        }

        const allowedMimeTypes = [
            'application/pdf',
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/webp',
            'application/msword', // .doc
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
            'application/vnd.ms-excel', // .xls
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
            throw new BadRequestException(
                'Invalid file type. Only PDF, images, Word, and Excel documents are allowed'
            );
        }

        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            throw new BadRequestException('File size exceeds 10MB limit');
        }

        const user = await this.userModel.findById(userId).select('_id').lean();
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const timestamp = Date.now();
        const fileExtension = file.originalname.split('.').pop();
        const sanitizedFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `user-documents/${userId}/${timestamp}_${sanitizedFileName}`;

        const fileUrl = await this.s3Service.uploadFile(
            fileName,
            file.buffer,
            file.mimetype,
        );

        const documentData: UserDocumentResponseDto = {
            fileName: file.originalname,
            fileUrl,
            fileType: file.mimetype,
            fileSize: file.size,
            uploadedAt: new Date(),
        };

        const updated = await this.userModel.findByIdAndUpdate(
            userId,
            { $push: { uploadedDocuments: documentData } },
            { new: true }
        ).select('uploadedDocuments');

        const last = updated?.uploadedDocuments?.at(-1) as
            | UploadedDocumentSubdoc
            | undefined;
        if (!last?._id) {
            throw new NotFoundException('User not found');
        }

        return {
            docId: last._id.toString(),
            ...documentData,
        };
    }

    async getDocuments(userId: string): Promise<UserDocumentResponseDto[]> {
        const user = await this.userModel
            .findById(userId)
            .select('uploadedDocuments')
            .lean()
            .exec();

        if (!user) {
            throw new NotFoundException('User not found');
        }

        return (user.uploadedDocuments || []).map((doc) => {
            const d = doc as UploadedDocumentSubdoc;
            return {
                docId: d._id.toString(),
                fileName: d.fileName,
                fileUrl: d.fileUrl,
                fileType: d.fileType,
                fileSize: d.fileSize,
                uploadedAt: d.uploadedAt,
            };
        });
    }

    async deleteDocument(userId: string, docId: string): Promise<void> {
        const user = await this.userModel.findById(userId).select('uploadedDocuments');
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const documentExists = user.uploadedDocuments?.some(
            (doc) =>
                (doc as UploadedDocumentSubdoc)._id.toString() === docId,
        );

        if (!documentExists) {
            throw new NotFoundException('Document not found');
        }

        await this.userModel.findByIdAndUpdate(
            userId,
            {
                $pull: {
                    uploadedDocuments: { _id: new Types.ObjectId(docId) },
                },
            },
            { new: true },
        );
    }

    async inviteFieldMentor(dto: InviteFieldMentorDto): Promise<{ token: string; expiresAt: Date }> {
        const user = await this.userModel.findOne({
            email: dto.email,
            $or: [
                { fieldMentorInvitation: { $exists: false } },
                { 'fieldMentorInvitation.expiresAt': { $lte: new Date() } }
            ]
        }).select('_id email firstName lastName').lean();

        if (!user) {
            const existingUser = await this.userModel.findOne({ email: dto.email }).select('fieldMentorInvitation').lean();
            if (!existingUser) {
                throw new NotFoundException('User not found with this email');
            }
            throw new ConflictException('User already has a pending invitation');
        }

        const token = nanoid(32);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

        await this.userModel.findByIdAndUpdate(user._id, {
            fieldMentorInvitation: {
                invitedBy: dto.invitedBy,
                invitedAt: new Date(),
                token,
                expiresAt,
            },
        });

        const inviter = await this.userModel.findById(dto.invitedBy).select('firstName lastName').lean();
        const inviterName = inviter ? `${inviter.firstName} ${inviter.lastName}` : 'CCC program staff';

        void this.mailer.sendFieldMentorInvitation({
            to: dto.email,
            invitedFirstName: user.firstName || 'there',
            inviterName,
            invitationLink: this.fieldMentorInviteLink(token),
        });

        return { token, expiresAt };
    }

    async acceptInvitation(dto: AcceptInvitationDto): Promise<UserResponseDto> {
        const user = await this.userModel.findOne({
            'fieldMentorInvitation.token': dto.token,
        });

        if (!user) {
            throw new NotFoundException('Invalid invitation token');
        }

        if (!user.fieldMentorInvitation || user.fieldMentorInvitation.expiresAt < new Date()) {
            throw new BadRequestException('Invitation has expired');
        }

        // Remove all assigned users since user is changing to field mentor
        const assignedIds = user.assignedId || [];

        if (assignedIds.length > 0) {
            // Remove assigned relationship for all assigned users
            await this.userModel.updateMany(
                { _id: { $in: assignedIds } },
                { $pull: { assignedId: user._id } }
            );
        }

        const updatedUser = await this.userModel.findByIdAndUpdate(
            user._id,
            {
                $set: {
                    role: ROLES.FIELD_MENTOR,
                    assignedId: [],
                },
                $unset: { fieldMentorInvitation: 1 },
            },
            { new: true }
        );

        if (!updatedUser) {
            throw new NotFoundException('User not found');
        }
        return toUserResponseDto(updatedUser);
    }

    async rejectInvitation(dto: AcceptInvitationDto): Promise<UserResponseDto> {
        const user = await this.userModel.findOne({
            'fieldMentorInvitation.token': dto.token,
        });

        if (!user) {
            throw new NotFoundException('Invalid invitation token');
        }

        if (!user.fieldMentorInvitation || user.fieldMentorInvitation.expiresAt < new Date()) {
            throw new BadRequestException('Invitation has expired');
        }

        const updatedUser = await this.userModel.findByIdAndUpdate(
            user._id,
            {
                $unset: { fieldMentorInvitation: 1 },
            },
            { new: true }
        );

        if (!updatedUser) {
            throw new NotFoundException('User not found');
        }

        return toUserResponseDto(updatedUser);
    }

    async markCompleted(dto: MarkCompletedDto): Promise<UserResponseDto> {
        const user = await this.userModel.findByIdAndUpdate(
            dto.userId,
            { hasCompleted: true },
            { new: true }
        ).exec();

        if (!user) {
            throw new NotFoundException('User not found');
        }

        void this.mailer.sendCourseCompleted({
            to: user.email,
            firstName: user.firstName,
        });

        return toUserResponseDto(user);
    }

    async issueCertificate(dto: IssueCertificateDto): Promise<UserResponseDto> {
        const updatedUser = await this.userModel.findOneAndUpdate(
            {
                _id: dto.userId,
                hasCompleted: true,
                hasIssuedCertificate: { $ne: true },
            },
            { hasIssuedCertificate: true },
            { new: true }
        ).exec();

        if (updatedUser) {
            void this.mailer.sendCertificateIssued({
                to: updatedUser.email,
                firstName: updatedUser.firstName,
            });
            return toUserResponseDto(updatedUser);
        }

        const user = await this.userModel.findById(dto.userId).select('hasCompleted hasIssuedCertificate').lean();

        if (!user) {
            throw new NotFoundException('User not found');
        }
        if (!user.hasCompleted) {
            throw new BadRequestException('User has not completed their progress');
        }
        if (user.hasIssuedCertificate) {
            throw new ConflictException('Certificate already issued to this user');
        }

        throw new BadRequestException('Certificate could not be issued at this time');
    }

    async getNotes(userId: string): Promise<NoteResponseDto[]> {
        const user = await this.userModel
            .findById(userId)
            .select('notes')
            .lean()
            .exec();

        if (!user) {
            throw new NotFoundException('User not found');
        }

        const notes = (user.notes || []).map((note: any) => ({
            _id: note._id.toString(),
            content: note.content,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
        }));

        notes.sort((a: NoteResponseDto, b: NoteResponseDto) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        return notes;
    }

    async addNote(userId: string, dto: CreateNoteDto): Promise<NoteResponseDto> {
        const updatedUser = await this.userModel.findByIdAndUpdate(
            userId,
            { $push: { notes: { content: dto.content } } },
            {
                new: true,
                projection: { notes: { $slice: -1 } }
            }
        ).lean().exec();

        if (!updatedUser || !updatedUser.notes || updatedUser.notes.length === 0) {
            throw new NotFoundException('User not found or failed to add note');
        }

        const newNote = updatedUser.notes[0] as any;

        return {
            _id: newNote._id.toString(),
            content: newNote.content,
            createdAt: newNote.createdAt,
            updatedAt: newNote.updatedAt,
        };
    }

    async updateNote(userId: string, noteId: string, dto: UpdateNoteDto): Promise<NoteResponseDto> {
        const noteObjectId = new Types.ObjectId(noteId);

        const result = await this.userModel.findOneAndUpdate(
            { _id: new Types.ObjectId(userId), 'notes._id': noteObjectId },
            {
                $set: {
                    'notes.$.content': dto.content,
                    'notes.$.updatedAt': new Date(),
                },
            },
            { new: true }
        ).select('notes').lean().exec();

        if (!result) {
            throw new NotFoundException('User or note not found');
        }

        const updatedNote = (result.notes as any[]).find(
            (n: any) => n._id.toString() === noteId
        );

        return {
            _id: updatedNote._id.toString(),
            content: updatedNote.content,
            createdAt: updatedNote.createdAt,
            updatedAt: updatedNote.updatedAt,
        };
    }

    async deleteNote(userId: string, noteId: string): Promise<void> {
        const result = await this.userModel.findOneAndUpdate(
            { _id: new Types.ObjectId(userId) },
            { $pull: { notes: { _id: new Types.ObjectId(noteId) } } },
            { new: true }
        ).exec();

        if (!result) {
            throw new NotFoundException('User not found');
        }
    }
}
