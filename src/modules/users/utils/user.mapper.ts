import { UserDocument } from '../schemas/user.schema';
import { UserResponseDto } from '../dto/user-response.dto';

export function toUserResponseDto(user: UserDocument | any): UserResponseDto {

    return {
        id: user._id?.toString() || String(user._id),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        role: user.role,
        roleId: user.roleId,
        profilePicture: user.profilePicture,
        interestId: user.interestId?.toString(),
        status: user.status,
        isEmailVerified: user.isEmailVerified,
        hasCompleted: user.hasCompleted || false,
        hasIssuedCertificate: user.hasIssuedCertificate || false,
        zoomUserId: user.zoomUserId || undefined,
        googleCalendarStatus: user.googleCalendarStatus || undefined,
        googleCalendarConnectedAt: user.googleCalendarConnectedAt || undefined,
        googleCalendarLastSyncAt: user.googleCalendarLastSyncAt || undefined,
        googleCalendarEmail: user.googleCalendarEmail || undefined,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        assignedId: user.assignedId,
        fieldMentorInvitation: user.fieldMentorInvitation
            ? {
                invitedBy: user.fieldMentorInvitation.invitedBy?.toString() || String(user.fieldMentorInvitation.invitedBy),
                invitedAt: user.fieldMentorInvitation.invitedAt,
                token: user.fieldMentorInvitation.token,
                expiresAt: user.fieldMentorInvitation.expiresAt,
            }
            : undefined,
    };
}