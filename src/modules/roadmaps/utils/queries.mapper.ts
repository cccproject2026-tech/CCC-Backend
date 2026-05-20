import { Types } from 'mongoose';
import { QueriesDocument, QueryItemDocument } from '../schemas/queries.schema';
import { QueryItemResponseDto, QueriesThreadResponseDto } from '../dto/queries.dto';
import { mapUserToDto } from './comments.mapper';
import { PopulatedUserResponseDto } from '../dto/populated-response.dto';


const toQueryItemResponseDto = (item: QueryItemDocument | any): QueryItemResponseDto => {
    const mentorDetails = mapUserToDto(item.repliedMentorId);

    return {
        _id: item._id?.toString() || String(item._id),
        actualQueryText: item.actualQueryText,
        createdDate: item.createdDate,
        repliedAnswer: item.repliedAnswer,
        repliedDate: item.repliedDate,
        repliedMentorId: mentorDetails as PopulatedUserResponseDto,
        status: item.status,
        nestedRoadMapItemId: item.nestedRoadMapItemId
            ? ((item.nestedRoadMapItemId as Types.ObjectId)?.toString?.() ?? String(item.nestedRoadMapItemId))
            : null,
    };
};

export const toQueriesThreadResponseDto = (doc: QueriesDocument | any): QueriesThreadResponseDto => ({
    _id: doc._id?.toString() || String(doc._id),
    userId: doc.userId?.toString() || String(doc.userId),
    roadMapId: doc.roadMapId?.toString() || String(doc.roadMapId),
    queries: doc.queries?.map(toQueryItemResponseDto) || [],
    // createdAt: doc.createdAt,
    // updatedAt: doc.updatedAt,
});