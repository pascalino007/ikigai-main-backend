import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateUserDto } from './dtos/create-user.dto';
import { UsersService } from './users.service';
import { SigninUserDto } from './dtos/signin-user.dto';
import { Users } from './user.entity';
import { UpdateUserDto } from './dtos/update-user.dto';
import { UploadService } from '../upload/upload.service';

@Controller('auth')
export class UsersController {

    constructor (
      private usersService : UsersService,
      private readonly uploadService: UploadService,
    ){}

    @Post('/signup')
    async createUser(@Body() body: CreateUserDto) {
        //get all the information of the users
      return await this.usersService.create(body);
    };

    // ✅ Signin route
  @Post('/signin')
  async signin(@Body() signinDto: SigninUserDto) {
    return await this.usersService.signin(signinDto);
  };

  // ===== Forgot password flow (static routes must come before parameterized :id) =====
  @Post('forgot-password')
  async forgotPassword(@Body('email') email: string) {
    return await this.usersService.requestPasswordReset(email);
  }

  @Post('verify-reset-otp')
  async verifyResetOtp(
    @Body('email') email: string,
    @Body('otp') otp: string,
  ) {
    return await this.usersService.verifyResetOtp(email, otp);
  }

  @Post('reset-password-with-token')
  async resetPasswordWithToken(
    @Body('resetToken') resetToken: string,
    @Body('newPassword') newPassword: string,
  ) {
    return await this.usersService.resetPasswordWithToken(resetToken, newPassword);
  }

  // ===== Admin: view OTP codes =====
  @Get('admin/otps')
  getAllOtps() {
    return UsersService.getAllOtps();
  }

  // Get all users
  @Get()
  async findAll(): Promise<Users[]> {
    return await this.usersService.findAll();
  }

  // Get a user by ID
  // ✅ Get a user by ID
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Users> {
    return await this.usersService.findOne(id);
  }

  // ✅ Update a user
  @Post(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<Users> {
    return await this.usersService.update(id, updateUserDto);
  }

  // ✅ Delete a user
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return await this.usersService.remove(id);
  }

  // ✅ Upload / replace user profile image (DigitalOcean Spaces)
  @Post(':id/profile-image')
  @UseInterceptors(FileInterceptor('image'))
  async uploadProfileImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      return { error: 'No image file provided (field name: image)' };
    }
    const imageUrl = await this.uploadService.uploadFile(file);
    const user = await this.usersService.update(id, { image: imageUrl } as UpdateUserDto);
    return { imageUrl, user };
  }

  // ✅ Change password (requires current password)
  @Post(':id/change-password')
  async changePassword(
    @Param('id', ParseIntPipe) id: number,
    @Body('currentPassword') currentPassword: string,
    @Body('newPassword') newPassword: string,
  ) {
    return this.usersService.changePassword(id, currentPassword, newPassword);
  }

  @Post('reset-password/:id')
async resetPassword(
  @Param('id', ParseIntPipe) id: number,
  @Body('newPassword') newPassword: string
) {
  return this.usersService.resetPassword(id, newPassword);
}
}
