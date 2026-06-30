import { IsMongoId, IsNotEmpty, IsString, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';

export class InviteFieldMentorDto {
    @ApiProperty()
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @ApiProperty()
    @IsMongoId()
    @IsNotEmpty()
    invitedBy: Types.ObjectId;
}

export class AcceptInvitationDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    token: string;
}

export class MarkCompletedDto {
    @ApiProperty()
    @IsMongoId()
    @IsNotEmpty()
    userId: Types.ObjectId;
}

export class IssueCertificateDto {
    @ApiProperty()
    @IsMongoId()
    @IsNotEmpty()
    userId: Types.ObjectId;

    @ApiProperty()
    @IsMongoId()
    @IsNotEmpty()
    issuedBy: Types.ObjectId;
}
