import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { CreateUserDto } from './dtos/create-user.dto';
import { UsersService } from './users.service';
import { SigninUserDto } from './dtos/signin-user.dto';
import { Users } from './user.entity';
import { UpdateUserDto } from './dtos/update-user.dto';

@Controller('auth')
export class UsersController {

    constructor (private usersService : UsersService){}

    @Post('/signup')
    createUser(@Body() body: CreateUserDto) {
        //get all the information of the users
        this.usersService.create(body);
    };

    // ✅ Signin route
  @Post('/signin')
  async signin(@Body() signinDto: SigninUserDto) {
    return await this.usersService.signin(signinDto);
  };

  // ✅ Get all users
  @Get()
  async findAll(): Promise<Users[]> {
    return await this.usersService.findAll();
  }

  // ✅ Get a user by ID
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Users> {
    return await this.usersService.findOne(id);
  }

  // ✅ Update a user
  @Patch(':id')
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
}
