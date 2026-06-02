import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import axios from 'axios';
import { nanoid } from 'nanoid';
import type PDFDocumentType from 'pdfkit';
import { readFile } from 'node:fs/promises';
import { Certificate, CertificateDocument } from './schemas/certificate.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { S3Service } from '../s3/s3.service';
import { CertificateResponseDto, IssueCertificateRequestDto } from './dto/certificate.dto';

const PDFDocument = require('pdfkit') as typeof PDFDocumentType;

@Injectable()
export class CertificatesService {
    constructor(
        @InjectModel(Certificate.name) private readonly certificateModel: Model<CertificateDocument>,
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        private readonly s3Service: S3Service,
        private readonly config: ConfigService,
    ) {}

    private toDto(row: CertificateDocument | (Certificate & { _id: Types.ObjectId })): CertificateResponseDto {
        return {
            certificateId: row.certificateId,
            certificateUrl: row.certificateUrl ?? null,
            pdfUrl: row.pdfUrl,
            pastorName: row.pastorName,
            mentorName: row.mentorName ?? null,
            directorName: row.issuedByName,
            programName: row.programName,
            completionDate: row.completionDate,
            issuedAt: row.issuedAt,
            personalMessage: row.personalMessage ?? null,
        };
    }

    async getByUserId(userId: string): Promise<CertificateResponseDto> {
        if (!Types.ObjectId.isValid(userId)) {
            throw new BadRequestException('Invalid user ID format');
        }
        const cert = await this.certificateModel.findOne({ userId: new Types.ObjectId(userId) }).lean().exec();
        if (!cert) {
            throw new NotFoundException('Certificate not found');
        }
        return this.toDto(cert as Certificate & { _id: Types.ObjectId });
    }

    async issue(dto: IssueCertificateRequestDto): Promise<CertificateResponseDto> {
        const userObjectId = new Types.ObjectId(dto.userId);
        const issuedByObjectId = new Types.ObjectId(dto.issuedBy);

        const [pastor, issuer] = await Promise.all([
            this.userModel.findById(userObjectId).select('firstName lastName hasCompleted completedAt assignedId').lean().exec(),
            this.userModel.findById(issuedByObjectId).select('firstName lastName').lean().exec(),
        ]);

        if (!pastor) {
            throw new NotFoundException('Pastor user not found');
        }
        if (!issuer) {
            throw new NotFoundException('Issuer user not found');
        }
        if (!pastor.hasCompleted) {
            throw new BadRequestException('User has not completed the program');
        }

        const existing = await this.certificateModel.findOne({ userId: userObjectId }).lean().exec();
        if (existing) {
            throw new ConflictException('Certificate already issued for this user');
        }

        const completionDate = dto.completionDate
            ? new Date(dto.completionDate)
            : (pastor.completedAt ? new Date(pastor.completedAt) : new Date());
        if (Number.isNaN(completionDate.getTime())) {
            throw new BadRequestException('Invalid completionDate');
        }

        const mentorName = await this.resolveMentorName(pastor.assignedId || []);
        const pastorName = `${pastor.firstName || ''} ${pastor.lastName || ''}`.trim() || 'Pastor';
        const issuedByName = `${issuer.firstName || ''} ${issuer.lastName || ''}`.trim() || 'Director';
        const issuedAt = new Date();
        const certificateId = `CCC-${nanoid(10).toUpperCase()}`;

        const pdfBuffer = await this.generateCertificatePdf({
            certificateId,
            pastorName,
            mentorName,
            programName: dto.programName,
            completionDate,
            issuedAt,
            issuedByName,
            personalMessage: dto.personalMessage?.trim() || undefined,
        });

        const key = `certificates/${dto.userId}/${certificateId}.pdf`;
        const pdfUrl = await this.s3Service.uploadFile(key, pdfBuffer, 'application/pdf');

        const created = await this.certificateModel.create({
            certificateId,
            userId: userObjectId,
            issuedBy: issuedByObjectId,
            issuedByName,
            pastorName,
            mentorName: mentorName || null,
            programName: dto.programName,
            completionDate,
            issuedAt,
            personalMessage: dto.personalMessage?.trim() || null,
            certificateUrl: pdfUrl,
            pdfUrl,
        });

        await this.userModel.updateOne(
            { _id: userObjectId },
            {
                $set: {
                    hasIssuedCertificate: true,
                },
            },
        ).exec();

        return this.toDto(created);
    }

    private async resolveMentorName(assignedIds: Types.ObjectId[]): Promise<string | null> {
        if (!assignedIds || assignedIds.length === 0) {
            return null;
        }
        const mentor = await this.userModel
            .findOne({ _id: { $in: assignedIds } })
            .select('firstName lastName role')
            .lean()
            .exec();
        if (!mentor) return null;
        const full = `${mentor.firstName || ''} ${mentor.lastName || ''}`.trim();
        return full || null;
    }

    private async generateCertificatePdf(params: {
        certificateId: string;
        pastorName: string;
        mentorName: string | null;
        programName: string;
        completionDate: Date;
        issuedAt: Date;
        issuedByName: string;
        personalMessage?: string;
    }): Promise<Buffer> {
        const doc = new PDFDocument({ size: 'A4', margin: 0 });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));

        const templateBuffer = await this.loadCertificateTemplateBuffer();
        if (templateBuffer) {
            try {
                doc.image(templateBuffer, 0, 0, { width: 595.28, height: 841.89 });
            } catch {
                // Continue rendering text-only certificate if template cannot be loaded.
            }
        }

        const darkBlue = '#0B2A59';
        const gold = '#9A7626';
        const gray = '#334155';

        // Name + program block (center of template)
        doc.font('Helvetica-Oblique').fontSize(46).fillColor(darkBlue).text(params.pastorName, 90, 315, {
            width: 415,
            align: 'center',
        });
        doc.font('Helvetica-Bold').fontSize(25).fillColor(darkBlue).text(params.programName.toUpperCase(), 92, 405, {
            width: 410,
            align: 'center',
        });

        // Bottom metadata row
        doc.font('Helvetica-Bold').fontSize(17).fillColor(darkBlue).text(this.formatPrettyDate(params.completionDate), 95, 553, {
            width: 105,
            align: 'center',
        });
        doc.font('Helvetica-Bold').fontSize(17).fillColor(darkBlue).text(params.certificateId, 370, 553, {
            width: 120,
            align: 'center',
        });

        // Signature/issued block
        doc.font('Helvetica-Bold').fontSize(15).fillColor(darkBlue).text(params.issuedByName.toUpperCase(), 400, 656, {
            width: 165,
            align: 'center',
        });
        doc.font('Helvetica').fontSize(12).fillColor(gray).text(`Assigned Mentor: ${params.mentorName || 'N/A'}`, 340, 688, {
            width: 220,
            align: 'center',
        });
        doc.font('Helvetica').fontSize(12).fillColor(gray).text(`Issued Date: ${this.formatPrettyDate(params.issuedAt)}`, 340, 705, {
            width: 220,
            align: 'center',
        });

        if (params.personalMessage) {
            doc.font('Helvetica-Bold').fontSize(13).fillColor(gold).text('Personal Message', 80, 740, {
                width: 430,
                align: 'center',
            });
            doc.font('Helvetica').fontSize(10).fillColor(gray).text(params.personalMessage, 70, 758, {
                width: 455,
                align: 'center',
                lineGap: 2,
            });
        }

        doc.end();

        return await new Promise<Buffer>((resolve, reject) => {
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
        });
    }

    private async loadCertificateTemplateBuffer(): Promise<Buffer | null> {
        const templatePath = this.config.get<string>('CERTIFICATE_TEMPLATE_IMAGE_PATH')?.trim();
        if (templatePath) {
            try {
                return await readFile(templatePath);
            } catch {
                // Fallback to URL mode.
            }
        }

        const templateUrl = this.config.get<string>('CERTIFICATE_TEMPLATE_IMAGE_URL')?.trim();
        if (templateUrl) {
            try {
                const img = await axios.get(templateUrl, { responseType: 'arraybuffer' });
                return Buffer.from(img.data);
            } catch {
                return null;
            }
        }

        return null;
    }

    private formatPrettyDate(date: Date): string {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }
}
