import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, PutObjectCommandInput } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class S3Service {
    private readonly s3Client: S3Client;
    private readonly bucketName: string;
    private readonly logger = new Logger(S3Service.name);

    constructor(private configService: ConfigService) {
        const accessKeyId = this.configService.get<string>('aws.accessKeyId');
        const secretAccessKey = this.configService.get<string>('aws.secretAccessKey');
        const region = this.configService.get<string>('aws.region') || 'us-east-1';

        this.s3Client = new S3Client({
            region,
            ...(accessKeyId && secretAccessKey && {
                credentials: { accessKeyId, secretAccessKey },
            }),
        });

        const bucket = this.configService.get<string>('aws.s3Bucket');

        if (!bucket) {
            throw new Error('AWS_S3_BUCKET (aws.s3Bucket) is not defined in configuration.');
        }

        this.bucketName = bucket;
    }

    async uploadFile(key: string, body: Buffer, mimeType: string): Promise<string> {
        const params: PutObjectCommandInput = {
            Bucket: this.bucketName,
            Key: key,
            Body: body,
            ContentType: mimeType,
            ACL: 'public-read',
        };

        try {
            try {
                await this.s3Client.send(new PutObjectCommand(params));
            } catch (error: any) {
                const aclBlocked =
                    error?.name === 'AccessControlListNotSupported' ||
                    error?.Code === 'AccessControlListNotSupported' ||
                    String(error?.message ?? '').includes('AccessControlListNotSupported');

                if (!aclBlocked) {
                    throw error;
                }

                this.logger.warn(
                    `S3 ACL public-read not supported for bucket; uploading without ACL: ${key}`,
                );
                const { ACL, ...withoutAcl } = params;
                await this.s3Client.send(new PutObjectCommand(withoutAcl));
            }

            const region = this.configService.get<string>('aws.region');
            return `https://${this.bucketName}.s3.${region}.amazonaws.com/${key}`;
        } catch (error) {
            this.logger.error(`S3 Upload failed for key: ${key}`, (error as Error)?.stack);
            throw new Error('S3_UPLOAD_FAILED');
        }
    }

}
