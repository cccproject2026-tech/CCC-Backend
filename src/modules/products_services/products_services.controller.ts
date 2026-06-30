import {
    Controller,
    Post,
    Get,
    Patch,
    Delete,
    Body,
    Param,
    Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProductsServicesService } from './products_services.service';
import { CreateScholarshipDto } from './dto/create-scholarship.dto';
import { UpdateScholarshipDto } from './dto/update-scholarship.dto';
import { ScholarshipResponseDto } from './dto/scholarship-response.dto';
import { AwardedUserDto } from './dto/awarded-item.dto';
import { BaseResponse } from '../../shared/interfaces/base-response.interface';

@ApiTags('Scholarships')
@Controller('scholarships')
export class ProductsServicesController {
    constructor(
        private readonly productsServicesService: ProductsServicesService,
    ) { }

    @Post()
    async createScholarship(
        @Body() dto: CreateScholarshipDto,
    ): Promise<BaseResponse<ScholarshipResponseDto>> {
        const data = await this.productsServicesService.createScholarship(dto);
        return {
            success: true,
            message: 'Scholarship created successfully',
            data,
        };
    }

    @Get()
    async getAllScholarships(
        @Query('status') status?: string,
    ): Promise<BaseResponse<ScholarshipResponseDto[]>> {
        let data: ScholarshipResponseDto[];

        if (status) {
            data = await this.productsServicesService.findScholarshipsByStatus(
                status,
            );
        } else {
            data = await this.productsServicesService.findAllScholarships();
        }

        return {
            success: true,
            message: 'Scholarships fetched successfully',
            data,
        };
    }

    @Get('statistics')
    async getStatistics(): Promise<
        BaseResponse<{
            totalScholarships: number;
            totalAwardsGiven: number;
            totalAmountDisbursed: number;
            activeScholarships: number;
        }>
    > {
        const data = await this.productsServicesService.getScholarshipStatistics();
        return {
            success: true,
            message: 'Scholarship statistics fetched successfully',
            data,
        };
    }

    @Get(':id')
    async getScholarshipById(
        @Param('id') id: string,
    ): Promise<BaseResponse<ScholarshipResponseDto>> {
        const data = await this.productsServicesService.findScholarshipById(id);
        return {
            success: true,
            message: 'Scholarship fetched successfully',
            data,
        };
    }

    @Patch(':id')
    async updateScholarship(
        @Param('id') id: string,
        @Body() updateDto: UpdateScholarshipDto,
    ): Promise<BaseResponse<ScholarshipResponseDto>> {
        const data = await this.productsServicesService.updateScholarship(
            id,
            updateDto,
        );
        return {
            success: true,
            message: 'Scholarship updated successfully',
            data,
        };
    }

    @Delete(':id')
    async deleteScholarship(
        @Param('id') id: string,
    ): Promise<BaseResponse<null>> {
        await this.productsServicesService.deleteScholarship(id);
        return {
            success: true,
            message: 'Scholarship deleted successfully',
            data: null,
        };
    }

    @Post(':id/awarded-users')
    async addAwardedUser(
        @Param('id') id: string,
        @Body() awardedUser: AwardedUserDto,
    ): Promise<BaseResponse<ScholarshipResponseDto>> {
        const data = await this.productsServicesService.addAwardedUser(
            id,
            awardedUser,
        );
        return {
            success: true,
            message: 'Awarded user added successfully',
            data,
        };
    }

    @Patch(':id/awarded-users/:index')
    async updateAwardedUser(
        @Param('id') id: string,
        @Param('index') index: string,
        @Body() updateData: Partial<AwardedUserDto>,
    ): Promise<BaseResponse<ScholarshipResponseDto>> {
        const data = await this.productsServicesService.updateAwardedUser(
            id,
            parseInt(index, 10),
            updateData,
        );
        return {
            success: true,
            message: 'Awarded user updated successfully',
            data,
        };
    }

    @Delete(':id/awarded-users/:index')
    async removeAwardedUser(
        @Param('id') id: string,
        @Param('index') index: string,
    ): Promise<BaseResponse<ScholarshipResponseDto>> {
        const data = await this.productsServicesService.removeAwardedUser(
            id,
            parseInt(index, 10),
        );
        return {
            success: true,
            message: 'Awarded user removed successfully',
            data,
        };
    }

    @Get('type/:type')
    async getScholarshipByType(
        @Param('type') type: string,
    ): Promise<BaseResponse<ScholarshipResponseDto>> {
        const data = await this.productsServicesService.findScholarshipByType(type);
        return {
            success: true,
            message: 'Scholarship fetched successfully',
            data,
        };
    }
}
