import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CreateUserDto } from './dtos/create-user.dto';
import { SigninUserDto } from './dtos/signin-user.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { Users } from './user.entity';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  const mockUsersService = {
    create: jest.fn(),
    signin: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    resetPassword: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createUser', () => {
    it('should create a new user', async () => {
      const dto: CreateUserDto = { email: 'test@example.com', password: 'password', username: 'testuser' } as any;
      const user = { id: 1, ...dto } as Users;
      const result = { user, rawPassword: 'password' };
      mockUsersService.create.mockResolvedValue(result);

      expect(await controller.createUser(dto)).toBe(result);
      expect(mockUsersService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('signin', () => {
    it('should sign in a user', async () => {
      const dto: SigninUserDto = { email: 'test@example.com', password: 'password' };
      const result = { message: 'Signin successful', user: { id: 1, email: 'test@example.com' } as Users };
      mockUsersService.signin.mockResolvedValue(result);

      expect(await controller.signin(dto)).toBe(result);
      expect(mockUsersService.signin).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAll', () => {
    it('should return an array of users', async () => {
      const result = [{ id: 1, email: 'test@example.com' }] as Users[];
      mockUsersService.findAll.mockResolvedValue(result);

      expect(await controller.findAll()).toBe(result);
      expect(mockUsersService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single user', async () => {
      const result = { id: 1, email: 'test@example.com' } as Users;
      mockUsersService.findOne.mockResolvedValue(result);

      expect(await controller.findOne(1)).toBe(result);
      expect(mockUsersService.findOne).toHaveBeenCalledWith(1);
    });
  });

  describe('update', () => {
    it('should update a user', async () => {
      const dto: UpdateUserDto = { email: 'updated@example.com' } as any;
      const result = { id: 1, ...dto } as Users;
      mockUsersService.update.mockResolvedValue(result);

      expect(await controller.update(1, dto)).toBe(result);
      expect(mockUsersService.update).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('remove', () => {
    it('should remove a user', async () => {
      const result = { deleted: true };
      mockUsersService.remove.mockResolvedValue(result);

      expect(await controller.remove(1)).toBe(result);
      expect(mockUsersService.remove).toHaveBeenCalledWith(1);
    });
  });

  describe('resetPassword', () => {
    it('should reset password', async () => {
      const id = 1;
      const newPassword = 'newPassword123';
      const result = { success: true };
      mockUsersService.resetPassword.mockResolvedValue(result);

      expect(await controller.resetPassword(id, newPassword)).toBe(result);
      expect(mockUsersService.resetPassword).toHaveBeenCalledWith(id, newPassword);
    });
  });
});