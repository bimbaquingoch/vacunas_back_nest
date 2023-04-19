import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';

import {
  EmployeeEntity,
  PersonEntity,
  UserEntity,
  UserRoleEntity,
} from '../../entities';
import { Status, Type, User } from '../../constants/app.constant';
import {
  CreateEmployeeDto,
  FilterEmployeeDto,
  UpdateEmployeeDto,
} from '../dtos';
import { PersonService } from '../../people/services';
import { UserService } from '../../users/services';
import { RoleService } from '../../roles/services';
import { UserRoleService } from '../../user-roles/services';
import { CreateEmployee } from '../models/create-employee.interface';
import { validateID } from '../../utils/validateiD';
import { EmployeeException } from '../../errors/employee.error';
import { Employee } from '../models/list-employees.interface';

/**
 * Service to Employee
 * @author csolorzano
 * @version 1.0.0
 */

@Injectable()
export class EmployeeService {
  constructor(
    @InjectRepository(EmployeeEntity)
    private _employeeRepository: Repository<EmployeeEntity>,
    private _userRoleService: UserRoleService,
    private _personService: PersonService,
    private _userService: UserService,
    private _roleService: RoleService,
  ) {}

  async filterEmployees(
    employees: SelectQueryBuilder<EmployeeEntity>,
    filters: FilterEmployeeDto,
  ): Promise<void> {
    const {
      dni,
      email,
      completeName,
      vaccine,
      isVaccinated,
      startDate,
      finishDate,
    } = filters;

    if (dni) {
      employees.andWhere('CAST(person.dni AS varchar) ILIKE :dni', {
        dni: `%${dni}%`,
      });
    }

    if (email) {
      employees.andWhere('employee.email ILIKE :email', {
        email: `%${email}%`,
      });
    }

    if (completeName) {
      employees.andWhere(
        "CONCAT(person.firstName, ' ', person.lastName) ILIKE :completeName",
        { completeName: `%${completeName}%` },
      );
    }

    if (vaccine) {
      employees.andWhere('vaccine.vaccineType ILIKE :vaccine', {
        vaccine: `%${vaccine}%`,
      });
    }

    if (isVaccinated) {
      employees.andWhere('employee.vaccinationStatus =:isVaccinated', {
        isVaccinated,
      });
    }

    if (startDate && finishDate) {
      employees.andWhere(
        'employeeVaccinations.vaccinationDate BETWEEN :startDate AND :finishDate',
        { startDate, finishDate },
      );
    }
  }

  async getEmployees(filters?: FilterEmployeeDto): Promise<EmployeeEntity[]> {
    const alias = EmployeeEntity.ALIAS;
    const employees = this._employeeRepository
      .createQueryBuilder(alias)
      .leftJoinAndSelect(`${alias}.user`, 'user', 'user.status =:status', {
        status: Status.Active,
      })
      .leftJoinAndSelect(
        `${alias}.employeeVaccinations`,
        'employeeVaccinations',
        'employeeVaccinations.status =:status',
        {
          status: Status.Active,
        },
      )
      .leftJoinAndSelect(
        'employeeVaccinations.vaccine',
        'vaccine',
        'vaccine.status =:status',
        {
          status: Status.Active,
        },
      )
      .leftJoinAndSelect(
        `${alias}.person`,
        'person',
        'person.status =:status',
        {
          status: Status.Active,
        },
      )
      .leftJoinAndSelect(
        'user.userRoles',
        'userRoles',
        'userRoles.status =:status',
        {
          status: Status.Active,
        },
      )
      .leftJoinAndSelect('userRoles.role', 'role', 'role.status =:status', {
        status: Status.Active,
      })
      .where(`${alias}.status =:status`, { status: Status.Active });

    if (filters) await this.filterEmployees(employees, filters);

    return await employees.getMany();
  }

  async mapEmployees(employees: EmployeeEntity[]): Promise<Employee[]> {
    return employees.map((employee) => {
      return {
        id: employee.id,
        dni: employee.person.dni,
        firstName: employee.person?.firstName,
        lastName: employee.person?.lastName,
        birthDate: employee.birthDate,
        homeAddress: employee.homeAddress,
        mobilePhone: employee.mobilePhone,
        status: employee.status === Status.Active ? 'Active' : 'Inactive',
        username: employee.user?.username,
        password: employee.user?.password,
        vaccinationStatus: employee.vaccinationStatus,
        vaccines:
          employee.employeeVaccinations?.length > 0
            ? employee.employeeVaccinations?.map((employeeVaccination) => {
                return {
                  id: employeeVaccination.vaccine?.id,
                  name: employeeVaccination.vaccine?.vaccineType,
                  doseNumber: employeeVaccination.doseNumber,
                  vaccinationDate: employeeVaccination.vaccinationDate,
                  employeeVaccinationId: employeeVaccination.id,
                };
              })
            : null,
        roles:
          employee.user?.userRoles?.length > 0
            ? employee.user?.userRoles.map((userRole) => {
                return { id: userRole.role?.id, name: userRole.role?.name };
              })
            : null,
      };
    });
  }

  async listEmployees(filters?: FilterEmployeeDto): Promise<Employee[]> {
    const employees = await this.getEmployees(filters);
    return await this.mapEmployees(employees);
  }

  async getEmployee(
    dni?: number,
    email?: string,
    employeeId?: number,
  ): Promise<EmployeeEntity> {
    const alias = EmployeeEntity.ALIAS;
    const employee = this._employeeRepository
      .createQueryBuilder(alias)
      .leftJoinAndSelect(
        `${alias}.person`,
        'person',
        'person.status =:status',
        { status: Status.Active },
      )
      .leftJoinAndSelect(`${alias}.user`, 'user', 'user.status =:status', {
        status: Status.Active,
      })
      .leftJoinAndSelect(
        `${alias}.employeeVaccinations`,
        'employeeVaccinations',
        'employeeVaccinations.status =:status',
        {
          status: Status.Active,
        },
      )
      .leftJoinAndSelect(
        'employeeVaccinations.vaccine',
        'vaccine',
        'vaccine.status =:status',
        {
          status: Status.Active,
        },
      )
      .leftJoinAndSelect(
        'user.userRoles',
        'userRoles',
        'userRoles.status =:status',
        {
          status: Status.Active,
        },
      )
      .leftJoinAndSelect('userRoles.role', 'role', 'role.status =:status', {
        status: Status.Active,
      })
      .where(`${alias}.status =:status`, { status: Status.Active });

    if (dni) employee.andWhere('person.dni =:dni', { dni });
    if (email) employee.andWhere(`${alias}.email =:email`, { email });
    if (employeeId)
      employee.andWhere(`${alias}.id =:employeeId`, { employeeId });

    return await employee.getOne();
  }

  async myInformation(dni: number): Promise<Employee> {
    const employee = await this.getEmployee(dni);
    return {
      id: employee.id,
      dni: employee.person.dni,
      firstName: employee.person?.firstName,
      lastName: employee.person?.lastName,
      birthDate: employee.birthDate,
      homeAddress: employee.homeAddress,
      mobilePhone: employee.mobilePhone,
      status: employee.status === Status.Active ? 'Active' : 'Inactive',
      username: employee.user?.username,
      password: employee.user?.password,
      vaccinationStatus: employee.vaccinationStatus,
      vaccines:
        employee.employeeVaccinations?.length > 0
          ? employee.employeeVaccinations?.map((employeeVaccination) => {
              return {
                id: employeeVaccination.vaccine?.id,
                name: employeeVaccination.vaccine?.vaccineType,
                doseNumber: employeeVaccination.doseNumber,
                vaccinationDate: employeeVaccination.vaccinationDate,
                employeeVaccinationId: employeeVaccination.id,
              };
            })
          : null,
      roles:
        employee.user?.userRoles?.length > 0
          ? employee.user?.userRoles.map((userRole) => {
              return { id: userRole.role?.id, name: userRole.role?.name };
            })
          : null,
    };
  }

  async mapCreateEmployee(
    employee: EmployeeEntity,
    userrole: UserRoleEntity,
  ): Promise<CreateEmployee> {
    return {
      id: employee.id,
      dni: employee.person.dni,
      firstName: employee.person?.firstName,
      lastName: employee.person?.lastName,
      birthDate: employee.birthDate,
      homeAddress: employee.homeAddress,
      mobilePhone: employee.mobilePhone,
      status: employee.status === Status.Active ? 'Active' : 'Inactive',
      username: userrole.user?.username,
      password: userrole.user?.password,
      role: userrole.role?.name,
    };
  }

  async createEmploye(
    createEmployee: CreateEmployeeDto,
  ): Promise<CreateEmployee> {
    const existPerson = await this._personService.getPerson(createEmployee.dni);
    const existEmailEmploye = await this.getEmployee(
      null,
      createEmployee.email,
    );
    const isValidDni = validateID(String(createEmployee.dni));
    const role = await this._roleService.getRole(createEmployee.role);
    const currentDay = new Date();

    if (existPerson)
      throw new EmployeeException('dni-exist', HttpStatus.BAD_REQUEST);

    if (existEmailEmploye)
      throw new EmployeeException('email-exist', HttpStatus.BAD_REQUEST);

    if (!isValidDni)
      throw new EmployeeException('invalid-dni', HttpStatus.BAD_REQUEST);

    const person = new PersonEntity();
    person.dni = createEmployee.dni;
    person.firstName = createEmployee.firstName;
    person.lastName = createEmployee.lastName;
    person.createdDate = currentDay;

    const savedPerson = await this._personService.createPerson(person);

    const employee = new EmployeeEntity();
    employee.email = createEmployee.email;
    employee.birthDate = createEmployee.birthDate;
    employee.homeAddress = createEmployee.homeAddress;
    employee.mobilePhone = createEmployee.mobilePhone;
    employee.vaccinationStatus = createEmployee.vaccinationStatus;
    employee.createdDate = currentDay;
    employee.person = savedPerson;

    const savedEmployee = await this._employeeRepository.save(employee);

    const user = new UserEntity();
    user.username = createEmployee.email;
    user.password = String(createEmployee.dni);
    user.createdDate = currentDay;
    user.employee = savedEmployee;

    const savedUser = await this._userService.createUser(user);

    const userRole = new UserRoleEntity();
    userRole.user = savedUser;
    userRole.role = role;
    userRole.createdDate = currentDay;

    const savedUserRole = await this._userRoleService.createUserRole(userRole);

    return await this.mapCreateEmployee(savedEmployee, savedUserRole);
  }

  async updateEmployee(
    dni: number,
    role?: string,
    type?: string,
    updateEmployee?: UpdateEmployeeDto,
  ) {
    const findEmployee = await this.getEmployee(dni);

    if (
      dni &&
      findEmployee &&
      type === Type.DELETE &&
      role === User.ADMINISTRATOR
    ) {
      await this._employeeRepository.update(findEmployee?.id, {
        status: Status.Inactive,
      });

      return {
        message: 'The employee has been deleted successfully',
        id: findEmployee.id,
        status: 'Inactive',
        employeeName:
          findEmployee.person.firstName + ' ' + findEmployee.person.lastName,
        dni: findEmployee.person.dni,
        email: findEmployee.email,
      };
    }

    if (dni && findEmployee && type === Type.UPDATE) {
      const employee = new EmployeeEntity();
      employee.birthDate = updateEmployee.birthDate;
      employee.email = updateEmployee.email;
      employee.homeAddress = updateEmployee.homeAddress;
      employee.mobilePhone = updateEmployee.mobilePhone;
      employee.vaccinationStatus = updateEmployee.vaccinationStatus;

      await this._employeeRepository.update(findEmployee.id, employee);

      const person = new PersonEntity();
      const isValidDni = validateID(String(updateEmployee?.dni));
      isValidDni ? (person.dni = updateEmployee.dni) : null;
      person.firstName = updateEmployee.firstName;
      person.lastName = updateEmployee.lastName;

      await this._personService.updatePerson(findEmployee.person?.id, person);

      const user = new UserEntity();

      if (updateEmployee.password) {
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(user.password, saltRounds);
        user.password = hashedPassword;
      }

      user.username = updateEmployee.email
        ? updateEmployee.email
        : updateEmployee.username;

      await this._userService.updateuser(findEmployee.user?.id, user);

      return {
        message: 'The employee has been updated successfully',
        employee: updateEmployee,
      };
    }

    throw new EmployeeException('employee-not-found', HttpStatus.BAD_REQUEST);
  }
}
