import { Injectable } from '@nestjs/common';

@Injectable()
export class UserHandler {
  buildNewUserMessage(data: {
    fullName: string;
    username: string;
    email: string;
    phoneNumber: string;
  }) {
    return `
👤 NEW USER REGISTERED

Name: ${data.fullName}
Username: ${data.username}
Email: ${data.email}
Phone: ${data.phoneNumber}
`;
  }
}
