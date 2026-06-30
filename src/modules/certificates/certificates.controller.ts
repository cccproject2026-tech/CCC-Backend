import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BaseResponse } from 'src/shared/interfaces/base-response.interface';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';
import { CertificateResponseDto, IssueCertificateRequestDto } from './dto/certificate.dto';
import { CertificatesService } from './certificates.service';

@ApiTags('Certificates')
@Controller('certificates')
export class CertificatesController {
    constructor(private readonly certificatesService: CertificatesService) {}

    @Post('issue')
    async issueCertificate(
        @Body() dto: IssueCertificateRequestDto,
    ): Promise<BaseResponse<CertificateResponseDto>> {
        const data = await this.certificatesService.issue(dto);
        return {
            success: true,
            message: 'Certificate issued successfully',
            data,
        };
    }

    @Get('user/:userId')
    async getByUser(
        @Param('userId', ParseMongoIdPipe) userId: string,
    ): Promise<BaseResponse<CertificateResponseDto>> {
        const data = await this.certificatesService.getByUserId(userId);
        return {
            success: true,
            message: 'Certificate fetched successfully',
            data,
        };
    }
}
