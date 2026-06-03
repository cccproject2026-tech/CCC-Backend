import { Types } from 'mongoose';
import { CommentsDocument, CommentItem, CommentItemDocument } from '../schemas/comments.schema';
import { CommentItemResponseDto, CommentsThreadResponseDto } from '../dto/comments.dto';
import { PopulatedUserResponseDto } from '../dto/populated-response.dto';

export const mapUserToDto = (userDoc: Types.ObjectId | any): PopulatedUserResponseDto | string => {
    if (userDoc && typeof userDoc === 'object' && userDoc._id) {
        return {
            _id: userDoc._id.toString(),
            email: userDoc.email,
            firstName: userDoc.firstName,
            lastName: userDoc.lastName,
            profilePicture: userDoc.profilePicture,
            role: userDoc.role,
        };
    }

    if (userDoc instanceof Types.ObjectId) {
        return userDoc.toString();
    }

    return "";
};


const toCommentItemResponseDto = (item: CommentItemDocument | any): CommentItemResponseDto => {
    const mentorDetails = mapUserToDto(item.mentorId);
    const nestedId =
        item.nestedRoadMapItemId != null
            ? (item.nestedRoadMapItemId as Types.ObjectId).toString?.() ??
              String(item.nestedRoadMapItemId)
            : null;

    return {
        _id: item._id?.toString() || String(item._id),
        text: item.text,
        addedDate: item.addedDate,
        mentorId: mentorDetails as PopulatedUserResponseDto,
        nestedRoadMapItemId: nestedId,
        taskId: nestedId,
    };
};

export const toCommentsThreadResponseDto = (doc: CommentsDocument | any): CommentsThreadResponseDto => ({
    _id: doc._id?.toString() || String(doc._id),
    userId: doc.userId?.toString() || String(doc.userId),
    roadMapId: doc.roadMapId?.toString() || String(doc.roadMapId),
    comments: doc.comments?.map(toCommentItemResponseDto) || [],
    // createdAt: doc.createdAt,
    // updatedAt: doc.updatedAt,
});