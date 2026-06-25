import { NotificationResponseDto } from "../dto/notification.dto";
import { NotificationDocument } from "../schemas/notification.schema";

function notificationItemTimestamp(item: any): number {
    if (item?.createdAt) {
        const parsed = new Date(item.createdAt).getTime();
        if (!Number.isNaN(parsed)) return parsed;
    }
    const id = item?._id?.toString?.() ?? "";
    if (/^[a-f\d]{24}$/i.test(id)) {
        return parseInt(id.substring(0, 8), 16) * 1000;
    }
    return 0;
}

export function mapToResponse(doc: NotificationDocument | any): NotificationResponseDto {
    const notifications =
        doc.notifications
            ?.map((n: any) => ({
                _id: n._id?.toString?.() ?? "",
                name: n.name,
                details: n.details,
                module: n.module,
                referenceId: n.referenceId,
                read: n.read ?? false,
                createdAt: n.createdAt,
            }))
            .sort(
                (a: any, b: any) =>
                    notificationItemTimestamp(b) - notificationItemTimestamp(a),
            ) || [];

    return {
        _id: doc._id.toString(),
        userId: doc.userId,
        role: doc.role,
        notifications,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}
