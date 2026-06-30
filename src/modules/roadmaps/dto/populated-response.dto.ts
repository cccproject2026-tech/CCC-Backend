import { ApiProperty } from '@nestjs/swagger';

export class PopulatedUserResponseDto {
    @ApiProperty()
    _id: string;
    @ApiProperty()
    email: string;
    @ApiProperty()
    firstName: string; 
    @ApiProperty()
    lastName: string;
    @ApiProperty()
    profilePicture: string;
    @ApiProperty()
    role: string;
}
