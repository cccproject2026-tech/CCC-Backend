import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { InterestService } from './interests.service';
import { CreateInterestDto, UpdateInterestDto } from './dto/create-interest.dto';
import { BaseResponse } from '../../shared/interfaces/base-response.interface';
import { InterestResponseDto } from './dto/interest-response.dto';
import { InterestMetadataDto } from './dto/interestMetadata.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { InterestFormFieldsService } from './services/interest-form-fields.service';
import {
    AddDynamicFieldDto,
    DynamicFieldDto,
    UpdateDynamicFieldsDto,
    InterestFormFieldsResponseDto,
    DynamicFieldsConfigResponseDto,
} from './dto/interest-form-fields.dto';

@Controller('interests')
export class InterestController {
    constructor(
        private readonly interestService: InterestService,
        private readonly formFieldsService: InterestFormFieldsService,
    ) { }

    @Post()
    async create(@Body() dto: CreateInterestDto): Promise<BaseResponse<InterestResponseDto>> {
        const data = await this.interestService.create(dto);
        return {
            success: true,
            message: 'Interest form submitted successfully',
            data,
        };
    }

    @Get()
    async getAll(
        @Query('search') search?: string,
        @Query('status') status?: string,
    ): Promise<BaseResponse<InterestResponseDto[]>> {
        const data = await this.interestService.findAll({ search, status });
        return {
            success: true,
            message: 'Filtered interests fetched successfully',
            data,
        };
    }

    @Get('metadata')
    async getMetadata(): Promise<BaseResponse<InterestMetadataDto>> {
        const data = await this.interestService.getMetadata();
        return {
            success: true,
            message: 'Metadata fetched successfully',
            data,
        };
    }

    @Get('form-fields')
    async getFormFields(): Promise<BaseResponse<InterestFormFieldsResponseDto>> {
        const data = await this.formFieldsService.getFormFields();
        return {
            success: true,
            message: 'Form fields fetched successfully',
            data,
        };
    }

    @Get('dynamic-fields')
    async getDynamicFieldsConfig(): Promise<BaseResponse<DynamicFieldsConfigResponseDto>> {
        const data = await this.formFieldsService.getDynamicFieldsConfig();
        return {
            success: true,
            message: 'Dynamic fields configuration fetched successfully',
            data,
        };
    }

    @Post('dynamic-fields')
    async addDynamicField(
        @Body() dto: AddDynamicFieldDto,
    ): Promise<BaseResponse<DynamicFieldsConfigResponseDto>> {
        const data = await this.formFieldsService.addField(dto);
        return {
            success: true,
            message: 'Dynamic field added successfully',
            data,
        };
    }

    @Delete('dynamic-fields/:fieldId')
    async removeDynamicField(
        @Param('fieldId') fieldId: string,
    ): Promise<BaseResponse<DynamicFieldsConfigResponseDto>> {
        const data = await this.formFieldsService.removeField(fieldId);
        return {
            success: true,
            message: 'Dynamic field removed successfully',
            data,
        };
    }

    @Patch('dynamic-fields')
    async replaceAllDynamicFields(
        @Body() dto: UpdateDynamicFieldsDto,
    ): Promise<BaseResponse<DynamicFieldsConfigResponseDto>> {
        const data = await this.formFieldsService.replaceAllFields(dto.fields);
        return {
            success: true,
            message: 'Dynamic fields updated successfully',
            data,
        };
    }

    @Patch('dynamic-fields/reorder')
    async reorderDynamicFields(
        @Body('fieldIds') fieldIds: string[],
    ): Promise<BaseResponse<DynamicFieldsConfigResponseDto>> {
        const data = await this.formFieldsService.reorderFields(fieldIds);
        return {
            success: true,
            message: 'Dynamic fields reordered successfully',
            data,
        };
    }

    @Patch('dynamic-fields/:fieldId')
    async updateDynamicField(
        @Param('fieldId') fieldId: string,
        @Body() dto: Partial<DynamicFieldDto>,
    ): Promise<BaseResponse<DynamicFieldsConfigResponseDto>> {
        const data = await this.formFieldsService.updateField(fieldId, dto);
        return {
            success: true,
            message: 'Dynamic field updated successfully',
            data,
        };
    }

    @Get('request')
    async getInterestsByStatus(
        @Query('status') status: string,
        @Query('limit') limit?: string,
    ): Promise<BaseResponse<any>> {
        const parsedLimit = limit ? parseInt(limit, 10) : undefined;
        const data = await this.interestService.getInterestsByStatus(status, parsedLimit);
        return {
            success: true,
            message: 'Interests fetched by status successfully',
            data,
        };
    }

    @Patch('request/:userId')
    async updateUserStatus(
        @Param('userId') userId: string,
        @Body('status') status: string,
    ): Promise<BaseResponse<UserResponseDto>> {
        const data = await this.interestService.updateUserStatus(userId, status);
        return {
            success: true,
            message: 'User status updated successfully',
            data,
        };
    }

    @Get('by-id/:id')
    async getById(@Param('id') id: string): Promise<BaseResponse<InterestResponseDto>> {
        const data = await this.interestService.findById(id);
        return {
            success: true,
            message: 'Interest form fetched successfully',
            data,
        };
    }

    @Delete('by-id/:id')
    async deleteById(@Param('id') id: string): Promise<BaseResponse<null>> {
        await this.interestService.deleteById(id);
        return {
            success: true,
            message: 'Interest form deleted successfully',
            data: null,
        };
    }

    @Get('by-email/:email')
    async getByEmail(@Param('email') email: string): Promise<BaseResponse<InterestResponseDto>> {
        const data = await this.interestService.findByEmail(email);
        return {
            success: true,
            message: 'Interest form fetched successfully',
            data,
        };
    }

    @Patch('by-email/:email')
    async update(
        @Param('email') email: string,
        @Body() dto: UpdateInterestDto,
    ): Promise<BaseResponse<InterestResponseDto>> {
        const data = await this.interestService.update(email, dto);
        return {
            success: true,
            message: 'Interest form updated successfully',
            data,
        };
    }
}
