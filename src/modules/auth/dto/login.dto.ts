import { IsEmail, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserResponseDto } from 'src/modules/users/dto/user-response.dto';

export class LoginDto {
    @ApiProperty()
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @ApiProperty()
    @IsNotEmpty()
    password: string;
}

export class LoginResponseDto {
    @ApiProperty()
    @IsNotEmpty()
    accessToken: string;

    @ApiProperty()
    @IsNotEmpty()
    refreshToken: string;

    @ApiPropertyOptional({ type: UserResponseDto })
    @IsOptional()
    user?: UserResponseDto
}
