import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';
import { Certificate, CertificateSchema } from './schemas/certificate.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { S3Module } from '../s3/s3.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Certificate.name, schema: CertificateSchema },
            { name: User.name, schema: UserSchema },
        ]),
        S3Module,
    ],
    controllers: [CertificatesController],
    providers: [CertificatesService],
    exports: [CertificatesService, MongooseModule],
})
export class CertificatesModule {}
