import {
    Controller,
    Post,
    Get,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles.constants';
import { BaseResponse } from '../../shared/interfaces/base-response.interface';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InterestService } from '../interests/interests.service';

@Controller('super-admin')
// @UseGuards(JwtAuthGuard, RolesGuard)
// @Roles(ROLES.SUPER_ADMIN)
export class SuperAdminController {
    constructor(
        private readonly usersService: UsersService,
        private readonly interestService: InterestService,
    ) { }

    @Post('directors')
    async createDirector(
        @Body() dto: CreateUserDto,
    ): Promise<BaseResponse<UserResponseDto>> {
        if (!dto.password) {
            return {
                success: false,
                message: 'Password is required for director creation',
                data: null as any,
            };
        }

        const interest = await this.interestService.create({
            firstName: dto.firstName,
            lastName: dto.lastName,
            email: dto.email,
            title: 'Director',
            profilePicture: dto.profilePicture,
            createdBy: 'admin',
        });

        const director = await this.usersService.update(interest.userId as string, {
            password: dto.password,
        });

        return {
            success: true,
            message: 'Director created successfully',
            data: director,
        };
    }

    @Get('directors')
    async getAllDirectors(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('search') search?: string,
    ): Promise<BaseResponse<any>> {
        const data = await this.usersService.findAll({
            role: ROLES.DIRECTOR,
            page: page ? parseInt(page) : undefined,
            limit: limit ? parseInt(limit) : undefined,
            search,
        });

        return {
            success: true,
            message: 'Directors fetched successfully',
            data,
        };
    }

    @Get('directors/:id')
    async getDirectorById(
        @Param('id') id: string,
    ): Promise<BaseResponse<UserResponseDto | null>> {
        const director = await this.usersService.findById(id);

        if (director.role !== ROLES.DIRECTOR) {
            return {
                success: false,
                message: 'User is not a director',
                data: null,
            };
        }

        return {
            success: true,
            message: 'Director fetched successfully',
            data: director,
        };
    }

    @Patch('directors/:id')
    async updateDirector(
        @Param('id') id: string,
        @Body() dto: UpdateUserDto,
    ): Promise<BaseResponse<UserResponseDto | null>> {
        if (dto.role && dto.role !== ROLES.DIRECTOR) {
            return {
                success: false,
                message: 'Cannot change director role through this endpoint',
                data: null,
            };
        }

        const updatedDirector = await this.usersService.update(id, dto);

        return {
            success: true,
            message: 'Director updated successfully',
            data: updatedDirector,
        };
    }

    @Delete('directors/:id')
    async deleteDirector(
        @Param('id') id: string,
    ): Promise<BaseResponse<null>> {
        await this.usersService.delete(id);

        return {
            success: true,
            message: 'Director deleted successfully',
            data: null,
        };
    }

    @Get('stats')
    async getSystemStats(): Promise<BaseResponse<any>> {
        const [directors, mentors, fieldMentors, pastors, layLeaders, seminarians, pending] =
            await Promise.all([
                this.usersService.findByRole(ROLES.DIRECTOR),
                this.usersService.findByRole(ROLES.MENTOR),
                this.usersService.findByRole(ROLES.FIELD_MENTOR),
                this.usersService.findByRole(ROLES.PASTOR),
                this.usersService.findByRole(ROLES.LAY_LEADER),
                this.usersService.findByRole(ROLES.SEMINARIAN),
                this.usersService.findByRole(ROLES.PENDING),
            ]);

        const stats = {
            totalUsers: directors.length + mentors.length + fieldMentors.length +
                pastors.length + layLeaders.length + seminarians.length + pending.length,
            byRole: {
                directors: directors.length,
                mentors: mentors.length,
                fieldMentors: fieldMentors.length,
                pastors: pastors.length,
                layLeaders: layLeaders.length,
                seminarians: seminarians.length,
                pending: pending.length,
            },
        };

        return {
            success: true,
            message: 'System statistics fetched successfully',
            data: stats,
        };
    }

    @Get('users')
    async getAllUsers(
        @Query('role') role?: string,
        @Query('status') status?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('search') search?: string,
    ): Promise<BaseResponse<any>> {
        const data = await this.usersService.findAll({
            role,
            status,
            page: page ? parseInt(page) : undefined,
            limit: limit ? parseInt(limit) : undefined,
            search,
        });

        return {
            success: true,
            message: 'Users fetched successfully',
            data,
        };
    }
}
