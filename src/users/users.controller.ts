import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateUserDto } from './dtos/create-user.dto';
import { RegisterWithOtpDto } from './dtos/register-otp.dto';
import { UsersService } from './users.service';
import { SigninUserDto } from './dtos/signin-user.dto';
import { Users } from './user.entity';
import { UpdateUserDto } from './dtos/update-user.dto';
import { UploadService } from '../upload/upload.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AppSignatureGuard } from '../auth/app-signature.guard';

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
  @UseGuards(AppSignatureGuard)
  async signin(@Body() signinDto: SigninUserDto, @Headers('x-app-id') appId?: string) {
    return await this.usersService.signin(signinDto, appId);
  };

  // ===== OTP-protected sign-up (email verification) =====
  @Post('register/request-otp')
  async requestRegisterOtp(@Body('email') email: string) {
    return await this.usersService.requestRegisterOtp(email);
  }

  @Post('register/verify')
  async verifyRegister(@Body() body: RegisterWithOtpDto) {
    return await this.usersService.verifyRegisterOtpAndCreate(body);
  }

  // ===== OTP-protected login (2FA, with optional trusted-device skip) =====
  @Post('login/request-otp')
  @UseGuards(AppSignatureGuard)
  async requestLoginOtp(
    @Body('email') email: string,
    @Body('password') password: string,
    @Body('deviceId') deviceId?: string,
    @Body('deviceToken') deviceToken?: string,
    @Headers('x-app-id') appId?: string,
  ) {
    return await this.usersService.requestLoginOtp(email, password, deviceId, deviceToken, appId);
  }

  @Post('login/verify')
  @UseGuards(AppSignatureGuard)
  async verifyLogin(
    @Body('email') email: string,
    @Body('otp') otp: string,
    @Body('deviceId') deviceId?: string,
    @Body('rememberDevice') rememberDevice?: boolean,
    @Body('deviceName') deviceName?: string,
    @Headers('x-app-id') appId?: string,
  ) {
    return await this.usersService.verifyLoginOtp(email, otp, deviceId, rememberDevice, deviceName, appId);
  }

  // ===== Single active session (one user, one device at a time) =====
  // Apps poll this; if valid=false the session was superseded by a newer login.
  @Post('session/check')
  async checkSession(
    @Body('userId') userId: number,
    @Body('sessionId') sessionId: string,
  ) {
    return await this.usersService.checkSession(userId, sessionId);
  }

  @Post('session/logout')
  async logoutSession(
    @Body('userId') userId: number,
    @Body('sessionId') sessionId?: string,
  ) {
    return await this.usersService.clearSession(userId, sessionId);
  }

  // ===== Silent session renewal =====
  // Exchanges a still-valid (long-lived) refresh token for a new short-lived
  // access token, without the user re-entering credentials. See
  // UsersService.refreshAccessToken for the rotation details.
  @Post('refresh-token')
  async refreshToken(@Body('refreshToken') refreshToken: string) {
    return await this.usersService.refreshAccessToken(refreshToken);
  }

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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  getAllOtps() {
    return UsersService.getAllOtps();
  }

  // ===== Mobile-app usage stats (Firebase push registrations) =====
  @Get('stats/app-usage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  getAppUsage() {
    return this.usersService.getAppUsageStats();
  }

  // Get all users
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return await this.usersService.remove(id);
  }

  // ✅ Upload / replace user profile image (Backblaze B2)
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

  // ✅ Update FCM token for push notifications (client app)
  @Post(':id/fcm-token')
  async updateFcmToken(
    @Param('id', ParseIntPipe) id: number,
    @Body('fcmToken') fcmToken: string,
  ): Promise<Users> {
    return await this.usersService.updateFcmToken(id, fcmToken);
  }
}
